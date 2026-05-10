// Browser-side Web Push helpers. Subscribes/unsubscribes the current user
// to the VAPID-keyed application server, then mirrors the subscription into
// public.push_subscriptions so the server cron can reach this device.

import { createClient } from '@/lib/supabase/client';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pushSupported() {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function vapidConfigured() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

export async function getRegistration() {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

export async function getCurrentSubscription() {
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribePush(userId) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error('VAPID public key is not configured.');
  const reg = await getRegistration();
  if (!reg) throw new Error('Service worker registration failed.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Не дано разрешение на уведомления.');

  const desiredKey = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // If a subscription exists with a different applicationServerKey, the
  // server-signed JWT won't match it and FCM returns 403. Force re-subscribe
  // when the key changes (e.g. VAPID key rotation, or first-time after env
  // came online).
  if (sub) {
    const existingKey = new Uint8Array(sub.options.applicationServerKey || new ArrayBuffer(0));
    let same = existingKey.length === desiredKey.length;
    for (let i = 0; same && i < existingKey.length; i++) {
      if (existingKey[i] !== desiredKey[i]) same = false;
    }
    if (!same) {
      try {
        const supabase = createClient();
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      } catch {}
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: desiredKey,
    });
  }
  const supabase = createClient();
  const json = sub.toJSON();
  await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || arrayBufferToBase64Url(sub.getKey('p256dh')),
    auth_key: json.keys?.auth || arrayBufferToBase64Url(sub.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 250),
  }, { onConflict: 'user_id,endpoint' });
  return sub;
}

export async function unsubscribePush(userId) {
  const sub = await getCurrentSubscription();
  if (sub) {
    const supabase = createClient();
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
