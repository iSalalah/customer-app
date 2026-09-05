/**
 * Everything is stored and transmitted as UTC ISO-8601. Conversion to the
 * municipality's local zone happens exactly once, here, at render time.
 */

export const DISPLAY_TIME_ZONE = 'Asia/Muscat';

const LOCALE_TAG = Object.freeze({ ar: 'ar-OM', en: 'en-GB' });

function tag(locale) {
  return LOCALE_TAG[locale] ?? LOCALE_TAG.en;
}

export function formatDate(isoString, locale = 'ar') {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    numberingSystem: 'latn',
  }).format(date);
}

export function formatDateTime(isoString, locale = 'ar') {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    numberingSystem: 'latn',
  }).format(date);
}

/** mm:ss for OTP validity and idle countdowns. */
export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Start of a local Muscat day expressed as a UTC ISO string, for date filters. */
export function startOfDayUtc(dateOnly) {
  if (!dateOnly) return null;
  const date = new Date(`${dateOnly}T00:00:00+04:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function endOfDayUtc(dateOnly) {
  if (!dateOnly) return null;
  const date = new Date(`${dateOnly}T23:59:59.999+04:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
