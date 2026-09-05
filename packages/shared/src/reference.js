/**
 * Reference-number format: DHO-YYYY-XXXXXX
 *
 * The 32-symbol alphabet is Crockford-style: no I, L, O or U, so that a citizen
 * reading a printed slip aloud cannot confuse 1/I, 0/O, or produce an unintended
 * word. Generation itself is cryptographic and lives on the API side
 * (apps/api/src/infra/crypto/reference.js) - only the format lives here, so the
 * SPAs can validate the tracking input before spending a network round trip.
 */

export const REFERENCE_PREFIX = 'DHO';
export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REFERENCE_RANDOM_LENGTH = 6;

/** 32^6 = 1,073,741,824 values per year. */
export const REFERENCE_KEYSPACE = REFERENCE_ALPHABET.length ** REFERENCE_RANDOM_LENGTH;

export const REFERENCE_PATTERN = new RegExp(
  `^${REFERENCE_PREFIX}-\\d{4}-[${REFERENCE_ALPHABET}]{${REFERENCE_RANDOM_LENGTH}}$`,
);

export function isValidReferenceNumber(value) {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value.trim().toUpperCase());
}

/**
 * Accepts what a citizen types on a kiosk keypad: lowercase, stray spaces or
 * dashes, and the two most common visual substitutions.
 */
export function normalizeReferenceInput(value) {
  if (typeof value !== 'string') return '';
  const compact = value
    .toUpperCase()
    .replace(/[\s_]+/g, '')
    .replace(/^DHO-?/, '')
    .replace(/-/g, '');
  if (compact.length !== 4 + REFERENCE_RANDOM_LENGTH) return '';
  const year = compact.slice(0, 4);
  const random = compact
    .slice(4)
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/U/g, 'V');
  const candidate = `${REFERENCE_PREFIX}-${year}-${random}`;
  return isValidReferenceNumber(candidate) ? candidate : '';
}

/** Builds the public tracking URL printed on the kiosk receipt and QR code. */
export function buildTrackingUrl(baseUrl, referenceNumber) {
  const trimmed = String(baseUrl ?? '').replace(/\/+$/, '');
  return `${trimmed}/${encodeURIComponent(referenceNumber)}`;
}
