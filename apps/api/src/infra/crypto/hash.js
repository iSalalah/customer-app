import crypto from 'node:crypto';

/** SHA-256 hex digest. Used for opaque session tokens and file checksums. */
export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Keyed HMAC-SHA256 hex digest. Used for OTP and civil-ID peppering. */
export function hmacSha256Hex(input, key) {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

/**
 * Length-safe constant-time comparison of two hex digests. `timingSafeEqual`
 * throws on a length mismatch, which would itself be a timing oracle, so the
 * length check happens first and returns a plain false.
 */
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/** Constant-time comparison of two arbitrary UTF-8 strings (CSRF tokens). */
export function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
