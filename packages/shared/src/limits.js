/**
 * Default security timings. The API overrides these from validated environment
 * variables (config/env.js); the SPAs use them to draw countdowns. They are
 * defaults, never the authority - the server always decides.
 */

export const OTP_DEFAULTS = Object.freeze({
  LENGTH: 6,
  TTL_SECONDS: 300,
  RESEND_COOLDOWN_SECONDS: 60,
  MAX_ATTEMPTS: 5,
  MAX_PER_PHONE_PER_HOUR: 3,
  MAX_PER_IP_PER_HOUR: 10,
});

export const SESSION_DEFAULTS = Object.freeze({
  CITIZEN_IDLE_TIMEOUT_SECONDS: 120,
  CITIZEN_ABSOLUTE_TIMEOUT_SECONDS: 1800,
  CITIZEN_IDLE_WARNING_SECONDS: 30,
  STAFF_ACCESS_TTL_SECONDS: 900,
  STAFF_REFRESH_TTL_SECONDS: 28800,
});

export const STAFF_LOGIN_DEFAULTS = Object.freeze({
  MAX_FAILED_LOGINS: 5,
  LOCKOUT_SECONDS: 900,
});

export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
});

export const TEXT_LIMITS = Object.freeze({
  TITLE_MIN: 5,
  TITLE_MAX: 200,
  DESCRIPTION_MIN: 20,
  DESCRIPTION_MAX: 4000,
  NOTE_MIN: 2,
  NOTE_MAX: 2000,
  REPLY_MIN: 2,
  REPLY_MAX: 2000,
  IDEMPOTENCY_KEY_MIN: 8,
  IDEMPOTENCY_KEY_MAX: 80,
});

export const COOKIE_NAMES = Object.freeze({
  CITIZEN_SESSION: 'dm.cs',
  STAFF_ACCESS: 'dm.sa',
  STAFF_REFRESH: 'dm.sr',
  CSRF: 'dm.csrf',
});

export const HEADER_NAMES = Object.freeze({
  CSRF: 'x-csrf-token',
  IDEMPOTENCY_KEY: 'idempotency-key',
  REQUEST_ID: 'x-request-id',
  KIOSK_ID: 'x-kiosk-id',
});
