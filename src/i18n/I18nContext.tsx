import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Language } from '../types/vpn';
import en from './locales/en.json';
import fa from './locales/fa.json';

type NestedDictionary = { [key: string]: string | NestedDictionary };

const dictionaries: Record<Language, NestedDictionary> = {
  en,
  fa,
};

// Safe keypath resolver e.g. "dashboard.connect" or "telemetry.download"
function getNestedValue(obj: NestedDictionary, path: string): string {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return path; // Fallback to key itself
    }
  }
  return typeof current === 'string' ? current : path;
}

export interface I18nContextValue {
  language: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const toggleLanguage = useAppStore((state) => state.toggleLanguage);

  const isRTL = language === 'fa';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.setAttribute('lang', language);
      root.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
      // Set dedicated class for Tailwind or pure CSS selection if needed
      if (isRTL) {
        root.classList.add('rtl');
        root.classList.remove('ltr');
      } else {
        root.classList.add('ltr');
        root.classList.remove('rtl');
      }
    }
  }, [language, isRTL]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[language] || dictionaries.en;
      let text = getNestedValue(dict, key);

      // Simple interpolation if params provided: e.g. {count: 2} -> {{count}}
      if (params) {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          text = text.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramVal));
        });
      }

      return text;
    },
    [language]
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      language,
      t,
      setLanguage,
      toggleLanguage,
      isRTL,
    }),
    [language, t, setLanguage, toggleLanguage, isRTL]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
