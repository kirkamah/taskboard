'use server';

import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const URL_RE = /^https?:\/\/.+/i;

function generateSecret() {
  // 32 random bytes hex-encoded — strong enough for HMAC.
  return crypto.randomBytes(32).toString('hex');
}

export async function createWebhook(url) {
  const cleanUrl = typeof url === 'string' ? url.trim() : '';
  if (!cleanUrl || !URL_RE.test(cleanUrl)) return { error: 'Нужен валидный http(s) URL' };
  if (cleanUrl.length > 500) return { error: 'URL слишком длинный (макс 500 символов)' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Не авторизованы' };

  const admin = createAdminClient();
  const secret = generateSecret();
  const { data, error } = await admin
    .from('webhook_subscriptions')
    .insert({ owner_id: user.id, url: cleanUrl, secret, is_active: true })
    .select('id, url, secret, is_active, created_at, last_delivered_at')
    .single();
  if (error) return { error: 'Не удалось создать подписку: ' + error.message };
  return { webhook: data };
}

export async function deleteWebhook(id) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Не авторизованы' };
  const admin = createAdminClient();
  const { error } = await admin
    .from('webhook_subscriptions')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);
  if (error) return { error: 'Не удалось удалить: ' + error.message };
  return { ok: true };
}

export async function toggleWebhook(id, nextActive) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Не авторизованы' };
  const admin = createAdminClient();
  const { error } = await admin
    .from('webhook_subscriptions')
    .update({ is_active: !!nextActive })
    .eq('id', id)
    .eq('owner_id', user.id);
  if (error) return { error: 'Не удалось обновить: ' + error.message };
  return { ok: true };
}

export async function rotateWebhookSecret(id) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Не авторизованы' };
  const admin = createAdminClient();
  const secret = generateSecret();
  const { data, error } = await admin
    .from('webhook_subscriptions')
    .update({ secret })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, secret')
    .single();
  if (error) return { error: 'Не удалось обновить секрет: ' + error.message };
  return { webhook: data };
}
