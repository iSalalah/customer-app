import crypto from 'node:crypto';

import { MIME_EXTENSION } from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { createLocalStorageAdapter } from './localStorageAdapter.js';
import { createS3StorageAdapter } from './s3StorageAdapter.js';

const config = getConfig();

let adapter = null;

export function getStorage() {
  if (adapter) return adapter;
  adapter =
    config.storage.driver === 's3'
      ? createS3StorageAdapter(config.storage.s3)
      : createLocalStorageAdapter({ root: config.storage.localRoot });
  return adapter;
}

export async function initStorage() {
  await getStorage().init();
}

/**
 * Storage keys are derived entirely server-side: yyyy/mm/<uuid>.<ext>, where the
 * extension comes from the *detected* MIME type. The uploaded filename never
 * participates, which is what makes path traversal structurally impossible
 * rather than merely filtered.
 */
export function buildStorageKey(detectedMime, now = new Date()) {
  const extension = MIME_EXTENSION[detectedMime];
  if (!extension) throw new Error(`no extension mapping for mime type ${detectedMime}`);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

/** Test seam: lets the integration suite inject an in-memory adapter. */
export function setStorageAdapter(next) {
  adapter = next;
}
