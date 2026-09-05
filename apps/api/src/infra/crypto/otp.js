import crypto from 'node:crypto';

import { getConfig } from '../../config/index.js';
import { hmacSha256Hex, safeEqualHex } from './hash.js';

/**
 * OTP generation and verification.
 *
 * The code itself never leaves this module except as the return value of
 * `generateOtpCode`, which is handed straight to the SMS adapter. Only the
 * peppered HMAC is persisted; nothing here is ever logged.
 */

/**
 * Cryptographically uniform decimal code. `crypto.randomInt` is rejection-
 * sampled internally, so there is no modulo bias. Math.random is never used.
 */
export function generateOtpCode(length = getConfig().otp.length) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += String(crypto.randomInt(0, 10));
  }
  return code;
}

/**
 * HMAC-SHA256(phone + ':' + code, OTP_PEPPER).
 *
 * The phone number is bound into the digest so that a hash captured for one
 * number cannot be replayed against another, and so that two citizens who
 * happen to receive the same six digits do not share a hash.
 */
export function hashOtpCode(phoneNumber, code, pepper = getConfig().secrets.otpPepper) {
  return hmacSha256Hex(`${phoneNumber}:${code}`, pepper);
}

export function verifyOtpCode(phoneNumber, code, expectedHash, pepper) {
  if (typeof code !== 'string' || code.length === 0) return false;
  return safeEqualHex(hashOtpCode(phoneNumber, code, pepper), expectedHash);
}
