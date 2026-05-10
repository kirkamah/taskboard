'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { pushSupported, vapidConfigured, getCurrentSubscription, subscribePush, unsubscribePush } from '@/lib/pushClient';
import { translate } from '@/lib/i18n';

// Profile-page toggle to subscribe / unsubscribe this browser from Web Push
// reminders. Subscriptions are per-device (a user can have many).
export default function PushToggle({ userId, locale = 'ru' }) {
  const t = (k, p) => translate(locale, k, p);
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
    return <p className="text-sm text-gray-500">{t('push.unsupported')}</p>;
  }
  if (!configured) {
    return <p className="text-sm text-gray-500">{t('push.notConfigured')}</p>;
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
      setError(e.message || t('common.error'));
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
        {subscribed ? t('push.enabled') : t('push.enable')}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        {t('push.hint')}
      </p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
