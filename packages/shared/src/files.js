/**
 * Attachment policy. The browser-supplied MIME type and filename are treated as
 * untrusted hints; the authoritative check is the magic-byte signature performed
 * on the server (see apps/api/src/middleware/upload.js).
 */

export const MIME_TYPE = Object.freeze({
  PDF: 'application/pdf',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
});

export const ALLOWED_MIME_TYPES = Object.freeze(Object.values(MIME_TYPE));

/** Canonical extension per accepted type. The uploaded name never decides this. */
export const MIME_EXTENSION = Object.freeze({
  [MIME_TYPE.PDF]: 'pdf',
  [MIME_TYPE.JPEG]: 'jpg',
  [MIME_TYPE.PNG]: 'png',
});

/** Extensions the browser file picker advertises, purely for UX. */
export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_REQUEST = 5;
/** Whole-body ceiling: 5 files plus form fields plus multipart overhead. */
export const MAX_UPLOAD_BODY_BYTES = MAX_FILE_SIZE_BYTES * MAX_ATTACHMENTS_PER_REQUEST + 512 * 1024;

/**
 * Leading signatures, checked against the first bytes of the buffer.
 * JPEG: FF D8 FF. PNG: 89 50 4E 47 0D 0A 1A 0A. PDF: 25 50 44 46 2D ("%PDF-").
 * `file-type` performs the full parse; this table is the cheap pre-filter and
 * the offline fallback used by the unit tests.
 */
export const MAGIC_SIGNATURES = Object.freeze({
  [MIME_TYPE.JPEG]: Object.freeze([Object.freeze([0xff, 0xd8, 0xff])]),
  [MIME_TYPE.PNG]: Object.freeze([Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
  [MIME_TYPE.PDF]: Object.freeze([Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d])]),
});

/**
 * @param {Uint8Array|Buffer} bytes
 * @returns {string|null} the detected allowed MIME type, or null.
 */
export function detectMimeFromMagic(bytes) {
  if (!bytes || bytes.length < 4) return null;
  for (const [mime, signatures] of Object.entries(MAGIC_SIGNATURES)) {
    for (const signature of signatures) {
      if (bytes.length < signature.length) continue;
      let matched = true;
      for (let i = 0; i < signature.length; i += 1) {
        if (bytes[i] !== signature[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return mime;
    }
  }
  return null;
}

export function isAllowedMime(mime) {
  return ALLOWED_MIME_TYPES.includes(mime);
}

// Control characters, which have no place in a display name.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
const RESERVED_CHARS = /[<>:"|?*\\/]/g;

/**
 * Produces a safe display name. The result is metadata only - it is never used
 * to build a filesystem path (the storage key is a UUID).
 */
export function sanitizeFileName(name, fallback = 'attachment') {
  if (typeof name !== 'string' || name.trim() === '') return fallback;
  const base = name.split(/[\\/]/).pop() ?? fallback;
  const cleaned = base
    .replace(CONTROL_CHARS, '')
    .replace(RESERVED_CHARS, '_')
    .replace(/\.{2,}/g, '.')
    .trim();
  const safe = cleaned.replace(/^\.+/, '').slice(0, 180);
  return safe === '' ? fallback : safe;
}

export function formatBytes(size, locale = 'en') {
  const units = ['B', 'KB', 'MB'];
  let value = Number(size) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}
