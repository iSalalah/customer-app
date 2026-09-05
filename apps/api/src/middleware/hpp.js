/**
 * HTTP parameter pollution guard.
 *
 * Express parses `?status=A&status=B` into an array. Downstream code that
 * expects a string would then compare against an array, and a Zod schema that
 * coerces could silently accept the wrong one. Collapsing duplicates to the last
 * value makes the shape predictable before validation runs.
 *
 * Keys listed in `allowArrays` keep array semantics.
 */
export function preventParameterPollution(allowArrays = []) {
  const allowed = new Set(allowArrays);

  return function hpp(req, _res, next) {
    if (req.query && typeof req.query === 'object') {
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value) && !allowed.has(key)) {
          req.query[key] = value[value.length - 1];
        }
      }
    }
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      for (const [key, value] of Object.entries(req.body)) {
        if (Array.isArray(value) && !allowed.has(key)) {
          req.body[key] = value[value.length - 1];
        }
      }
    }
    next();
  };
}

export default preventParameterPollution;
