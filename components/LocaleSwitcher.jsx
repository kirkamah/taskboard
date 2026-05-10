'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Languages, Check } from 'lucide-react';
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n';
import { setLocale as setLocaleAction } from '@/app/profile/locale/actions';

export default function LocaleSwitcher({ initialLocale = 'ru' }) {
  const [current, setCurrent] = useState(initialLocale);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const onPick = async (loc) => {
    if (loc === current || busy) return;
    setBusy(true);
    setCurrent(loc);
    await setLocaleAction(loc);
    setBusy(false);
    // Refresh so server-rendered strings update.
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {LOCALES.map((loc) => {
        const active = current === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => onPick(loc)}
            disabled={busy}
            className={`px-3 py-1.5 text-sm border rounded-lg inline-flex items-center gap-2 disabled:opacity-50 ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            <Languages size={14} />
            {LOCALE_LABELS[loc]}
            {active && <Check size={14} />}
          </button>
        );
      })}
    </div>
  );
}
