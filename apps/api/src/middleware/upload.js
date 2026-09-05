import crypto from 'node:crypto';

import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';

import {
  ALLOWED_MIME_TYPES,
  ERROR_CODE,
  MIME_TYPE,
  detectMimeFromMagic,
  sanitizeFileName,
} from '@dhofar/shared';

import { getConfig } from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';

const config = getConfig();

/**
 * Upload pipeline.
 *
 * Files are buffered in memory, never written to a temporary path, so a request
 * that fails validation or whose transaction rolls back leaves nothing behind on
 * disk. The 10 MB per-file cap makes the memory cost bounded and predictable.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileBytes,
    files: config.uploads.maxFilesPerRequest,
    fields: 20,
    fieldNameSize: 100,
    fieldSize: 8 * 1024,
    parts: config.uploads.maxFilesPerRequest + 20,
  },
  fileFilter(_req, file, cb) {
    // Cheap first pass on the declared type. The authoritative check is the
    // magic-byte inspection below, after the bytes have actually arrived.
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new ApiError(415, ERROR_CODE.UNSUPPORTED_FILE_TYPE, 'Only PDF, JPEG and PNG files are accepted.', {
          logContext: { declaredMime: file.mimetype },
        }),
      );
      return;
    }
    cb(null, true);
  },
});

/** Translates Multer's own errors into the standard envelope. */
function translateMulterError(error) {
  if (!(error instanceof multer.MulterError)) return error;
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ApiError(413, ERROR_CODE.FILE_TOO_LARGE, 'Each file must be 10 MB or smaller.');
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_PART_COUNT':
      return new ApiError(
        422,
        ERROR_CODE.ATTACHMENT_LIMIT_EXCEEDED,
        'A request may carry at most 5 attachments.',
      );
    case 'LIMIT_UNEXPECTED_FILE':
      return new ApiError(400, ERROR_CODE.VALIDATION_ERROR, 'Unexpected file field.');
    default:
      return new ApiError(400, ERROR_CODE.VALIDATION_ERROR, 'The upload could not be processed.');
  }
}

export function acceptAttachments(fieldName = 'attachments') {
  const handler = upload.array(fieldName, config.uploads.maxFilesPerRequest);
  return function attachmentsMiddleware(req, res, next) {
    handler(req, res, (error) => (error ? next(translateMulterError(error)) : next()));
  };
}

/**
 * Content inspection.
 *
 * Two independent checks must agree before a file is accepted:
 *   1. `file-type` parses the container and reports what the bytes actually are.
 *   2. The declared MIME must match that result.
 *
 * A .png renamed to .pdf, a PHP file with a JPEG header bolted on, or an
 * `image/jpeg` label over a ZIP all fail here. The declared name is used only
 * for display and is sanitised before storage.
 */
export async function inspectUploadedFiles(files = []) {
  const inspected = [];

  for (const file of files) {
    const buffer = file.buffer;
    if (!buffer || buffer.length === 0) {
      throw new ApiError(400, ERROR_CODE.VALIDATION_ERROR, 'One of the uploaded files is empty.');
    }

    const reject = (reason, detectedMime) => {
      throw new ApiError(415, ERROR_CODE.UNSUPPORTED_FILE_TYPE, 'Only PDF, JPEG and PNG files are accepted.', {
        logContext: { reason, declaredMime: file.mimetype, detectedMime: detectedMime ?? 'unknown' },
      });
    };

    // Check 1 - the leading bytes. Cheap, and rejects most junk before any
    // container parsing happens.
    const signatureMime = detectMimeFromMagic(buffer);
    if (!signatureMime || !ALLOWED_MIME_TYPES.includes(signatureMime)) {
      reject('signature not in the allowlist', signatureMime);
    }

    // Check 2 - the container actually parses as that type. `file-type` THROWS
    // on a truncated or malformed container (a bare PNG signature with no IHDR
    // chunk, say), which is precisely what a crafted upload looks like, so the
    // throw is a rejection - never an internal error, and never rescued by
    // falling back to check 1.
    let parsed;
    try {
      parsed = await fileTypeFromBuffer(buffer);
    } catch {
      reject('container failed to parse', signatureMime);
    }

    if (!parsed || parsed.mime !== signatureMime) {
      reject('signature and container disagree', parsed?.mime);
    }

    const detected = signatureMime;

    // The declared type must agree with the real one. `image/jpg` is a common
    // browser variant of image/jpeg and is the single tolerated alias.
    const declared = file.mimetype === 'image/jpg' ? MIME_TYPE.JPEG : file.mimetype;
    if (declared !== detected) {
      throw new ApiError(415, ERROR_CODE.UNSUPPORTED_FILE_TYPE, 'The file content does not match its type.', {
        logContext: { declaredMime: declared, detectedMime: detected },
      });
    }

    inspected.push({
      originalFileName: sanitizeFileName(file.originalname),
      detectedMime: detected,
      sizeBytes: buffer.length,
      checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
      buffer,
    });
  }

  return inspected;
}

export default acceptAttachments;
