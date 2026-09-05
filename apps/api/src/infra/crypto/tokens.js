import crypto from 'node:crypto';

import { randomToken, sha256Hex } from './hash.js';

/**
 * Opaque session tokens.
 *
 * A token is 32 random bytes. The client receives it in an HttpOnly cookie; the
 * server stores only `sha256(token)`. A database dump therefore yields no usable
 * session, and there is no signature to forge because there is no structure.
 */

export const TOKEN_BYTES = 32;

export function issueSessionToken() {
  const token = randomToken(TOKEN_BYTES);
  return { token, tokenHash: sha256Hex(token) };
}

export function hashSessionToken(token) {
  return sha256Hex(token);
}

/** Refresh-rotation family id, shared by every token descended from one login. */
export function newFamilyId() {
  return crypto.randomUUID();
}

/**
 * CSRF token for the double-submit pattern. It is deliberately NOT secret and
 * NOT HttpOnly - its only job is to be unreadable by a cross-origin page.
 */
export function issueCsrfToken() {
  return randomToken(24);
}
