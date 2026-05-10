'use client';

import { createContext, useContext } from 'react';
import { translate, normalizeLocale } from '@/lib/i18n';

const LocaleContext = createContext('ru');

export function LocaleProvider({ locale, children }) {
  return <LocaleContext.Provider value={normalizeLocale(locale)}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return (key, params) => translate(locale, key, params);
}
