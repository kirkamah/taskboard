'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { pushSupported, vapidConfigured, getCurrentSubscription, subscribePush, unsubscribePush } from '@/lib/pushClient';

// Profile-page toggle to subscribe / unsubscribe this browser from Web Push
// reminders. Subscriptions are per-device (a user can have many).
export default function PushToggle({ userId }) {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSupported(pushSupported());
    setConfigured(vapidConfigured());
    if (pushSupported()) {
      getCurrentSubscription().then((sub) => setSubscribed(!!sub)).catch(() => {});
    }
  }, []);

  if (!supported) {
    return <p className="text-sm text-gray-500">Этот браузер не поддерживает Web Push.</p>;
  }
  if (!configured) {
    return <p className="text-sm text-gray-500">Push-уведомления не настроены администратором (нет VAPID-ключа).</p>;
  }

  const onToggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (subscribed) {
        await unsubscribePush(userId);
        setSubscribed(false);
      } else {
        await subscribePush(userId);
        setSubscribed(true);
      }
    } catch (e) {
      setError(e.message || 'Ошибка');
    }
    setBusy(false);
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`px-3 py-1.5 text-sm border rounded-lg inline-flex items-center gap-2 disabled:opacity-50 ${subscribed ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
      >
        {subscribed ? <Bell size={14} /> : <BellOff size={14} />}
        {subscribed ? 'Уведомления включены' : 'Включить уведомления'}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        Получать push-уведомления на этом устройстве о приближающихся дедлайнах. Можно отключить в любой момент.
      </p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
