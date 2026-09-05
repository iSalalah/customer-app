import crypto from 'node:crypto';

import { REFERENCE_ALPHABET, REFERENCE_PREFIX, REFERENCE_RANDOM_LENGTH } from '@dhofar/shared';

/**
 * Reference-number generation: DHO-YYYY-XXXXXX.
 *
 * Uniqueness is guaranteed by the unique index on Request.referenceNumber, not
 * by this function - the caller retries on a collision inside its transaction
 * (see requests.service.js#createRequest).
 */

const ALPHABET_LENGTH = REFERENCE_ALPHABET.length;
// 256 % 32 === 0, so a byte maps onto the alphabet with no modulo bias. The
// guard keeps that true if the alphabet is ever changed.
const UNBIASED = 256 % ALPHABET_LENGTH === 0;

export function generateReferenceSuffix(length = REFERENCE_RANDOM_LENGTH) {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const byte of bytes) {
      if (out.length === length) break;
      if (!UNBIASED) {
        // Rejection sampling for a non-power-of-two alphabet.
        const limit = Math.floor(256 / ALPHABET_LENGTH) * ALPHABET_LENGTH;
        if (byte >= limit) continue;
      }
      out += REFERENCE_ALPHABET[byte % ALPHABET_LENGTH];
    }
  }
  return out;
}

/**
 * @param {Date} [now] injected so tests can pin the year deterministically.
 */
export function generateReferenceNumber(now = new Date()) {
  const year = now.getUTCFullYear();
  return `${REFERENCE_PREFIX}-${year}-${generateReferenceSuffix()}`;
}
