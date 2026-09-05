import pino from 'pino';

import { getConfig } from '../config/index.js';

const config = getConfig();

/**
 * Redaction list. Anything that could carry a credential, an OTP, a citizen
 * identifier or a file path is replaced before the line is serialised. Redaction
 * happens inside pino, so even an accidental `logger.info({ req })` is safe.
 */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'confirmPassword',
  'code',
  'otp',
  'otpCode',
  'codeHash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'sessionToken',
  'civilId',
  'civilIdEncrypted',
  'civilIdHash',
  'secret',
  'apiKey',
  '*.password',
  '*.passwordHash',
  '*.code',
  '*.token',
  '*.civilId',
  'body.password',
  'body.code',
  'body.phoneNumber',
];

export const logger = pino({
  level: config.isTest ? 'silent' : config.logging.level,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: { service: 'dhofar-api', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  transport: config.logging.pretty
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', singleLine: false } }
    : undefined,
});

/** Child logger bound to a correlation id, used by the error handler. */
export function loggerFor(requestId) {
  return logger.child({ requestId });
}

export default logger;
