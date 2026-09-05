import argon2 from 'argon2';

/**
 * Argon2id at the OWASP 2024 minimum (19 MiB, t=2, p=1). The parameters are
 * encoded inside the hash string, so raising them later re-hashes on next login
 * without a migration (see `needsRehash`).
 */
const OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

export async function hashPassword(plaintext) {
  return argon2.hash(plaintext, OPTIONS);
}

/**
 * Never throws on a malformed stored hash - a corrupt row must read as "wrong
 * password", not as a 500 that distinguishes it from a valid account.
 */
export async function verifyPassword(hash, plaintext) {
  try {
    return await argon2.verify(hash, plaintext, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same time as a real verification when the username does not
 * exist, so response timing cannot be used to enumerate staff accounts.
 */
const DUMMY_HASH_PROMISE = hashPassword('unused-constant-time-placeholder');

export async function dummyVerify(plaintext = 'x') {
  const hash = await DUMMY_HASH_PROMISE;
  return verifyPassword(hash, plaintext);
}

export function needsRehash(hash) {
  try {
    return argon2.needsRehash(hash, OPTIONS);
  } catch {
    return true;
  }
}
