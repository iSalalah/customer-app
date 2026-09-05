import { ERROR_CODE } from '@dhofar/shared';

/**
 * The only error type the API deliberately exposes.
 *
 * `message` is user-facing and must stay safe to render on a public kiosk.
 * Anything diagnostic belongs in `logContext`, which the error handler writes to
 * the log against the correlation id and never returns to the client.
 */
export class ApiError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options.details ?? [];
    this.meta = options.meta ?? undefined;
    this.headers = options.headers ?? undefined;
    this.logContext = options.logContext ?? undefined;
    this.expose = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(code = ERROR_CODE.VALIDATION_ERROR, message = 'The request could not be processed.', options) {
    return new ApiError(400, code, message, options);
  }

  static unauthenticated(code = ERROR_CODE.UNAUTHENTICATED, message = 'Authentication is required.', options) {
    return new ApiError(401, code, message, options);
  }

  static sessionExpired(options) {
    return new ApiError(401, ERROR_CODE.SESSION_EXPIRED, 'Your session has ended.', options);
  }

  static forbidden(code = ERROR_CODE.FORBIDDEN, message = 'You do not have access to this resource.', options) {
    return new ApiError(403, code, message, options);
  }

  static notFound(message = 'The requested resource was not found.', options) {
    return new ApiError(404, ERROR_CODE.NOT_FOUND, message, options);
  }

  static conflict(code, message, options) {
    return new ApiError(409, code, message, options);
  }

  static unprocessable(code, message, options) {
    return new ApiError(422, code, message, options);
  }

  static locked(code, message, options) {
    return new ApiError(423, code, message, options);
  }

  static tooManyRequests(message = 'Too many requests. Please wait and try again.', options) {
    return new ApiError(429, ERROR_CODE.RATE_LIMITED, message, options);
  }

  static internal(message = 'An unexpected error occurred.', options) {
    return new ApiError(500, ERROR_CODE.INTERNAL_ERROR, message, options);
  }

  static unavailable(message = 'The service is temporarily unavailable.', options) {
    return new ApiError(503, ERROR_CODE.SERVICE_UNAVAILABLE, message, options);
  }
}

export default ApiError;
