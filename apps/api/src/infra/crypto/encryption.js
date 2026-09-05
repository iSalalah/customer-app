import crypto from 'node:crypto';

import { getConfig } from '../../config/index.js';
import { hmacSha256Hex } from './hash.js';

/**
 * AES-256-GCM for the one field that is both personally identifying and not
 * needed for querying: the civil ID. Format is "v1.<iv>.<tag>.<ciphertext>",
 * all base64url, with the version prefix so a future key rotation can be
 * detected rather than guessed.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

function keyBuffer() {
  const key = Buffer.from(getConfig().secrets.civilIdEncryptionKey, 'base64url');
  if (key.length !== 32) {
    throw new Error('CIVIL_ID_ENC_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function encryptSensitive(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSensitive(payload) {
  if (!payload) return null;
  const parts = String(payload).split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('unrecognised ciphertext format');
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Deterministic lookup digest, so uniqueness can be enforced without plaintext. */
export function hashCivilId(civilId) {
  if (!civilId) return null;
  return hmacSha256Hex(String(civilId).trim(), getConfig().secrets.civilIdPepper);
}
