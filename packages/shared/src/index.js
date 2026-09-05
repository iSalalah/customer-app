export * from './statuses.js';
export * from './roles.js';
export * from './logs.js';
export * from './phone.js';
export * from './files.js';
export * from './limits.js';
export * from './errors.js';
export * from './reference.js';
export * from './time.js';

export const LOCALES = Object.freeze(['ar', 'en']);
export const DEFAULT_LOCALE = 'ar';
export const LOCALE_DIRECTION = Object.freeze({ ar: 'rtl', en: 'ltr' });

export function directionFor(locale) {
  return LOCALE_DIRECTION[locale] ?? 'ltr';
}
