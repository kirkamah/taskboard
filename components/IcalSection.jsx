'use client';

import { useState } from 'react';
import { CalendarClock, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import { generateIcalToken, revokeIcalToken } from '@/app/profile/ical/actions';
import { translate } from '@/lib/i18n';

// Profile-page block that exposes a personal iCal URL. Users paste the URL
// into Google Calendar / Apple Calendar / Outlook; those clients re-fetch
// periodically and surface every due-dated task as an event.
export default function IcalSection({ initialToken, origin, locale = 'ru' }) {
  const t = (k, p) => translate(locale, k, p);
  const [token, setToken] = useState(initialToken || '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const url = token ? `${origin}/api/ical/${token}/calendar.ics` : '';

  const generate = async () => {
    setBusy(true);
    setError('');
    const res = await generateIcalToken();
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setToken(res.token);
  };

  const rotate = async () => {
    if (!window.confirm(t('ical.confirmRotate'))) return;
    await generate();
  };

  const revoke = async () => {
    if (!window.confirm(t('ical.confirmRevoke'))) return;
    setBusy(true);
    setError('');
    const res = await revokeIcalToken();
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setToken('');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-2">
        <CalendarClock size={14} /> {t('ical.heading')}
      </h2>
      <p className="text-xs text-gray-500 mb-3">{t('ical.hint')}</p>

      {!token ? (
        <button
          onClick={generate}
          disabled={busy}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {t('ical.generate')}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={url}
              onClick={(e) => e.target.select()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-xs"
            />
            <button
              onClick={copy}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 inline-flex items-center gap-1 text-sm"
            >
              {copied ? <><Check size={14} /> {t('ical.copied')}</> : <><Copy size={14} /> {t('ical.copy')}</>}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={rotate}
              disabled={busy}
              className="text-xs px-2.5 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <RefreshCw size={12} /> {t('ical.rotate')}
            </button>
            <button
              onClick={revoke}
              disabled={busy}
              className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Trash2 size={12} /> {t('ical.revoke')}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
