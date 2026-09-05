import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LOCALE, LOCALES, directionFor, errorTranslationKey } from '@dhofar/shared';

import ar from './ar.json';
import en from './en.json';

/**
 * Minimal translation layer.
 *
 * No user-facing string is written inside a component: every one is a key
 * resolved here, which is what makes the Arabic/English switch complete rather
 * than partial. A missing key surfaces the key itself in development so it is
 * caught rather than silently rendered as an empty string.
 */

const CATALOGS = { ar, en };
// Deliberately NOT persisted: language is a per-session preference on a shared
// kiosk, and localStorage is off limits for anything session-related.
const I18nContext = createContext(null);

function resolveInitialLocale() {
  const configured = import.meta.env.VITE_DEFAULT_LOCALE;
  return LOCALES.includes(configured) ? configured : DEFAULT_LOCALE;
}

function interpolate(template, values) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(resolveInitialLocale);

  const direction = directionFor(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale, direction]);

  const t = useCallback(
    (key, values) => {
      const catalog = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
      const template = catalog[key] ?? CATALOGS[DEFAULT_LOCALE][key];
      if (template === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return interpolate(template, values);
    },
    [locale],
  );

  const toggleLocale = useCallback(() => {
    setLocale((current) => (current === 'ar' ? 'en' : 'ar'));
  }, []);

  const value = useMemo(
    () => ({ locale, direction, t, setLocale, toggleLocale }),
    [locale, direction, t, toggleLocale],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

/** Picks the Arabic or English field of a bilingual API object. */
export function useLocalizedName() {
  const { locale } = useI18n();
  return useCallback(
    (entity, fallback = '') => {
      if (!entity) return fallback;
      return (locale === 'ar' ? entity.nameAr : entity.nameEn) ?? entity.nameAr ?? entity.nameEn ?? fallback;
    },
    [locale],
  );
}

/** Maps an API error code to localised text, with a safe generic fallback. */
export function useErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (error) => {
      if (!error) return null;
      if (error.isNetworkError) return t('error.NETWORK');
      return t(errorTranslationKey(error.code));
    },
    [t],
  );
}
