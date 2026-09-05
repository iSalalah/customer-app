import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COOKIE_NAMES } from '@dhofar/shared';

import { getEnv } from './env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT = path.resolve(here, '..', '..');

/**
 * Derived, immutable application configuration. Everything downstream reads
 * this object rather than process.env, so a missing variable is impossible at
 * runtime and every default is visible in one place.
 */
function build() {
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';
  const secureCookies = isProduction ? true : env.COOKIE_SECURE;

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction,
    isTest,
    isDevelopment: env.NODE_ENV === 'development',

    server: Object.freeze({
      host: env.API_HOST,
      port: env.API_PORT,
      trustProxy: env.TRUST_PROXY,
      jsonBodyLimit: '100kb',
      urlencodedBodyLimit: '100kb',
      shutdownGraceMs: 10_000,
    }),

    logging: Object.freeze({ level: env.LOG_LEVEL, pretty: !isProduction && !isTest }),

    database: Object.freeze({ url: env.DATABASE_URL }),
    redis: Object.freeze({ url: env.REDIS_URL, keyPrefix: env.REDIS_KEY_PREFIX }),

    secrets: Object.freeze({
      otpPepper: env.OTP_PEPPER,
      civilIdPepper: env.CIVIL_ID_PEPPER,
      civilIdEncryptionKey: env.CIVIL_ID_ENC_KEY,
      sessionSecret: env.SESSION_SECRET,
    }),

    cookies: Object.freeze({
      names: COOKIE_NAMES,
      domain: env.COOKIE_DOMAIN || undefined,
      secure: secureCookies,
      sameSite: 'strict',
      path: '/',
    }),

    session: Object.freeze({
      citizenIdleSeconds: env.CITIZEN_IDLE_TIMEOUT_SECONDS,
      citizenAbsoluteSeconds: env.CITIZEN_ABSOLUTE_TIMEOUT_SECONDS,
      citizenIdleWarningSeconds: env.CITIZEN_IDLE_WARNING_SECONDS,
      staffAccessSeconds: env.STAFF_ACCESS_TTL_SECONDS,
      staffRefreshSeconds: env.STAFF_REFRESH_TTL_SECONDS,
    }),

    otp: Object.freeze({
      length: env.OTP_LENGTH,
      ttlSeconds: env.OTP_TTL_SECONDS,
      resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      maxPerPhonePerHour: env.OTP_MAX_PER_PHONE_PER_HOUR,
      maxPerIpPerHour: env.OTP_MAX_PER_IP_PER_HOUR,
    }),

    staffLogin: Object.freeze({
      maxFailedLogins: env.STAFF_MAX_FAILED_LOGINS,
      lockoutSeconds: env.STAFF_LOCKOUT_SECONDS,
    }),

    rateLimits: Object.freeze({
      global: Object.freeze({
        max: env.RATE_LIMIT_GLOBAL_MAX,
        windowSeconds: env.RATE_LIMIT_GLOBAL_WINDOW_SECONDS,
      }),
      login: Object.freeze({
        max: env.RATE_LIMIT_LOGIN_MAX,
        windowSeconds: env.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
      }),
      tracking: Object.freeze({
        max: env.RATE_LIMIT_TRACKING_MAX,
        windowSeconds: env.RATE_LIMIT_TRACKING_WINDOW_SECONDS,
      }),
      upload: Object.freeze({
        max: env.RATE_LIMIT_UPLOAD_MAX,
        windowSeconds: env.RATE_LIMIT_UPLOAD_WINDOW_SECONDS,
      }),
    }),

    cors: Object.freeze({ allowedOrigins: Object.freeze([...env.CORS_ALLOWED_ORIGINS]) }),

    urls: Object.freeze({
      kiosk: env.PUBLIC_KIOSK_URL,
      admin: env.PUBLIC_ADMIN_URL,
      trackingBase: env.PUBLIC_TRACKING_BASE_URL,
    }),

    storage: Object.freeze({
      driver: env.STORAGE_DRIVER,
      localRoot: path.resolve(API_ROOT, env.STORAGE_LOCAL_ROOT),
      s3: Object.freeze({
        endpoint: env.S3_ENDPOINT || undefined,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      }),
    }),

    uploads: Object.freeze({
      maxFileBytes: env.MAX_UPLOAD_BYTES,
      maxFilesPerRequest: env.MAX_ATTACHMENTS_PER_REQUEST,
    }),

    scanner: Object.freeze({
      enabled: env.MALWARE_SCAN_ENABLED,
      driver: env.MALWARE_SCANNER_DRIVER,
      clamav: Object.freeze({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT }),
    }),

    sms: Object.freeze({
      driver: env.SMS_DRIVER,
      senderId: env.SMS_SENDER_ID,
      endpoint: env.SMS_HTTP_ENDPOINT,
      apiKey: env.SMS_HTTP_API_KEY,
      timeoutMs: env.SMS_HTTP_TIMEOUT_MS,
    }),

    docs: Object.freeze({ swaggerEnabled: env.SWAGGER_ENABLED && !isProduction }),
  });
}

let instance = null;

export function getConfig() {
  if (!instance) instance = build();
  return instance;
}

export function resetConfigCache() {
  instance = null;
}

export default { getConfig };
