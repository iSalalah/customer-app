import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { ERROR_CODE } from '@dhofar/shared';

import { getConfig } from '../config/index.js';
import { logger } from '../infra/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { buildErrorBody } from '../utils/respond.js';

const config = getConfig();

/**
 * The single exit point for every error.
 *
 * Known errors become a safe code and a safe sentence. Everything else becomes
 * INTERNAL_ERROR and is logged once, in full, against the correlation id - the
 * client learns the id, never the cause. No stack trace, SQL fragment, Prisma
 * message or filesystem path can reach a response through this function.
 */
export function errorHandler(error, req, res, _next) {
  const requestId = req.id;
  let normalized = error;

  if (error instanceof ZodError) {
    normalized = ApiError.badRequest(ERROR_CODE.VALIDATION_ERROR, 'Some of the submitted values are not valid.', {
      details: error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
    });
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    normalized = translatePrismaError(error);
  } else if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    normalized = ApiError.internal();
  } else if (error?.type === 'entity.too.large') {
    normalized = new ApiError(413, ERROR_CODE.PAYLOAD_TOO_LARGE, 'The request body is too large.');
  } else if (error?.type === 'entity.parse.failed') {
    normalized = ApiError.badRequest(ERROR_CODE.VALIDATION_ERROR, 'The request body could not be parsed.');
  } else if (!(error instanceof ApiError)) {
    normalized = ApiError.internal();
  }

  const status = normalized.status ?? 500;

  // Log the real error exactly once, with everything an engineer needs.
  const logPayload = {
    requestId,
    status,
    code: normalized.code,
    method: req.method,
    path: req.originalUrl,
    err: {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: config.isProduction ? undefined : error?.stack,
    },
    context: normalized.logContext,
  };

  if (status >= 500) logger.error(logPayload, 'request failed');
  else logger.warn(logPayload, 'request rejected');

  if (normalized.headers) {
    for (const [name, value] of Object.entries(normalized.headers)) res.setHeader(name, value);
  }

  const body = buildErrorBody({
    code: normalized.code ?? ERROR_CODE.INTERNAL_ERROR,
    message: normalized.message ?? 'An unexpected error occurred.',
    details: normalized.details ?? [],
    requestId,
  });
  if (normalized.meta !== undefined) body.meta = normalized.meta;

  if (res.headersSent) return res.end();
  return res.status(status).json(body);
}

/**
 * Prisma errors carry table and column names. They are mapped to generic codes;
 * the original is preserved only in logContext.
 */
function translatePrismaError(error) {
  switch (error.code) {
    case 'P2002':
      return ApiError.conflict(ERROR_CODE.DUPLICATE_SUBMISSION, 'This record already exists.', {
        logContext: { prismaCode: error.code, target: error.meta?.target },
      });
    case 'P2003':
      return ApiError.badRequest(ERROR_CODE.VALIDATION_ERROR, 'A referenced record does not exist.', {
        logContext: { prismaCode: error.code, field: error.meta?.field_name },
      });
    case 'P2025':
      return ApiError.notFound('The requested resource was not found.', {
        logContext: { prismaCode: error.code },
      });
    default:
      return ApiError.internal(undefined, { logContext: { prismaCode: error.code } });
  }
}

export default errorHandler;
