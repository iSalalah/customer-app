/**
 * Express 4 does not forward a rejected promise to the error middleware.
 * Wrapping every async handler here is what makes `throw ApiError.forbidden()`
 * inside a service reach the central error handler instead of hanging the
 * request.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
