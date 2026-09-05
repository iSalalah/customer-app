import { ERROR_CODE, COOKIE_NAMES, HEADER_NAMES } from '@dhofar/shared';

import { getConfig } from '../config/index.js';
import { issueCsrfToken } from '../infra/crypto/tokens.js';
import { safeEqualString } from '../infra/crypto/hash.js';
import { ApiError } from '../utils/ApiError.js';

const config = getConfig();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF.
 *
 * The token is issued in a readable (non-HttpOnly) cookie; the SPA copies it
 * into X-CSRF-Token. A cross-origin page can cause the cookie to be *sent* but
 * cannot *read* it, so it cannot populate the header. SameSite=Strict is the
 * first line; this is the second, for the browsers and flows where SameSite is
 * not enough.
 */

export function issueCsrfCookie(req, res, next) {
  if (!req.cookies?.[COOKIE_NAMES.CSRF]) {
    res.cookie(COOKIE_NAMES.CSRF, issueCsrfToken(), {
      httpOnly: false, // by design: the SPA must read it
      secure: config.cookies.secure,
      sameSite: config.cookies.sameSite,
      domain: config.cookies.domain,
      path: config.cookies.path,
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  next();
}

/** Rejects a state-changing request whose Origin is not in the allowlist. */
function originAllowed(req) {
  const origin = req.get('origin');
  if (!origin) return true; // same-origin form posts and server-side callers send none
  return config.cors.allowedOrigins.includes(origin);
}

export function verifyCsrf(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  if (!originAllowed(req)) {
    return next(
      ApiError.forbidden(ERROR_CODE.CSRF_TOKEN_INVALID, 'The request origin is not permitted.', {
        logContext: { origin: req.get('origin') },
      }),
    );
  }

  const cookieToken = req.cookies?.[COOKIE_NAMES.CSRF];
  const headerToken = req.get(HEADER_NAMES.CSRF);

  if (!cookieToken || !headerToken || !safeEqualString(cookieToken, headerToken)) {
    return next(
      ApiError.forbidden(ERROR_CODE.CSRF_TOKEN_INVALID, 'The security token is missing or invalid.'),
    );
  }

  return next();
}

export default verifyCsrf;
