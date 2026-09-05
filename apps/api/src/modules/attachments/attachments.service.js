import { ERROR_CODE, MAX_ATTACHMENTS_PER_REQUEST } from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { logger } from '../../infra/logger.js';
import { buildStorageKey, getStorage } from '../../infra/storage/index.js';
import { getScanner } from '../../infra/scanner/index.js';
import { ApiError } from '../../utils/ApiError.js';

const config = getConfig();

/**
 * The attachment pipeline shared by request creation, citizen replies and
 * later additions.
 *
 * Order matters and is deliberate:
 *   1. count check   - cheapest, rejects before any I/O
 *   2. scan          - a file that fails never reaches storage at all
 *   3. store         - objects written under server-generated UUID keys
 *   4. (caller) DB transaction
 *   5. rollback      - if the caller's transaction fails, every object written
 *                      in step 3 is deleted, so orphans cannot accumulate
 */

export function assertWithinAttachmentBudget({ existingCount, incomingCount, policy }) {
  const max = Math.min(policy?.max ?? MAX_ATTACHMENTS_PER_REQUEST, config.uploads.maxFilesPerRequest);
  if (existingCount + incomingCount > max) {
    throw ApiError.unprocessable(
      ERROR_CODE.ATTACHMENT_LIMIT_EXCEEDED,
      `A request may carry at most ${max} attachments.`,
      { meta: { max, existingCount, incomingCount } },
    );
  }
  if (policy?.required && existingCount + incomingCount < (policy.min ?? 1)) {
    throw ApiError.unprocessable(
      ERROR_CODE.ATTACHMENT_REQUIRED,
      'This service requires supporting documents.',
      { meta: { min: policy.min ?? 1 } },
    );
  }
}

async function scanOrThrow(file) {
  const result = await getScanner().scan(file.buffer, {
    fileName: file.originalFileName,
    mimeType: file.detectedMime,
  });

  if (result.status === 'INFECTED') {
    logger.warn(
      { fileName: file.originalFileName, signature: result.signature },
      'attachment rejected by malware scanner',
    );
    throw ApiError.unprocessable(
      ERROR_CODE.UNSUPPORTED_FILE_TYPE,
      'This file could not be accepted. Please try a different file.',
    );
  }

  return result.status;
}

/**
 * Scans then stores. Returns rows ready for `attachment.createMany` plus a
 * `rollback` closure the caller MUST invoke if its transaction fails.
 */
export async function scanAndStore({ files, uploadedByType, uploadedById }) {
  const storage = getStorage();
  const storedKeys = [];
  const rows = [];

  const rollback = async () => {
    await Promise.all(storedKeys.map((key) => storage.remove(key).catch(() => {})));
    storedKeys.length = 0;
  };

  try {
    for (const file of files) {
      const scanStatus = await scanOrThrow(file);
      const storageKey = buildStorageKey(file.detectedMime);

      await storage.put(storageKey, file.buffer, file.detectedMime);
      storedKeys.push(storageKey);

      rows.push({
        originalFileName: file.originalFileName,
        storageKey,
        storageProvider: storage.name,
        mimeType: file.detectedMime,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        scanStatus,
        scannedAt: scanStatus === 'SKIPPED' ? null : new Date(),
        uploadedByType,
        uploadedById: uploadedById ?? null,
      });
    }
  } catch (error) {
    await rollback();
    throw error;
  }

  return { rows, rollback };
}

/**
 * Opens an authorised download stream. Authorisation happened before this call;
 * what remains is refusing to hand back a file the scanner condemned and one
 * that has vanished from the object store.
 */
export async function openAttachmentStream(attachment) {
  if (attachment.scanStatus === 'INFECTED' || attachment.scanStatus === 'PENDING') {
    throw ApiError.forbidden(
      ERROR_CODE.ATTACHMENT_UNAVAILABLE,
      'This file is not available for download.',
      { logContext: { attachmentId: attachment.id, scanStatus: attachment.scanStatus } },
    );
  }

  try {
    return await getStorage().createReadStream(attachment.storageKey);
  } catch (error) {
    logger.error(
      { attachmentId: attachment.id, err: { message: error.message } },
      'stored object could not be opened',
    );
    // The storage key is never echoed back - a missing file is simply not found.
    throw ApiError.notFound('The requested file was not found.');
  }
}

/** Headers that make a browser save the file rather than render it in place. */
export function attachmentDownloadHeaders(attachment) {
  const asciiName = attachment.originalFileName.replace(/[^\x20-\x7E]/g, '_');
  return {
    'Content-Type': attachment.mimeType,
    'Content-Length': String(attachment.sizeBytes),
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
      attachment.originalFileName,
    )}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'no-store, private',
  };
}
