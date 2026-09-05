import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

import { logger } from '../logger.js';

/**
 * Development / single-host storage adapter.
 *
 * Every key is validated against a strict pattern and the resolved absolute
 * path is re-checked to be inside the root, so a crafted key cannot escape the
 * directory even if a caller forgets to sanitise. The root must live outside any
 * web root - nothing serves this directory statically.
 */

const KEY_PATTERN = /^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

export function createLocalStorageAdapter({ root }) {
  function resolveSafe(key) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new Error('invalid storage key');
    }
    const absolute = path.resolve(root, key);
    const boundary = path.resolve(root) + path.sep;
    if (!absolute.startsWith(boundary)) {
      throw new Error('storage key escapes the storage root');
    }
    return absolute;
  }

  return {
    name: 'LOCAL',

    async init() {
      await fs.mkdir(root, { recursive: true });
      logger.info({ root }, 'local storage adapter ready');
    },

    async put(key, buffer, _contentType) {
      const absolute = resolveSafe(key);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      // wx: refuse to overwrite. A UUID collision must surface, not silently win.
      await fs.writeFile(absolute, buffer, { flag: 'wx', mode: 0o600 });
      return { key, provider: 'LOCAL' };
    },

    async createReadStream(key) {
      const absolute = resolveSafe(key);
      await fs.access(absolute);
      return createReadStream(absolute);
    },

    async remove(key) {
      try {
        await fs.unlink(resolveSafe(key));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn({ key, err: { message: error.message } }, 'failed to remove stored object');
        }
      }
    },

    async exists(key) {
      try {
        await fs.access(resolveSafe(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}
