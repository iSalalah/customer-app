import { z } from 'zod';

/**
 * Environment validation. This module fails the process closed: an invalid or
 * missing variable stops boot rather than producing a half-configured server.
 * It also refuses to start in production with any known development placeholder.
 */

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((v) => v === true || v === 'true' || v === '1' || v === 'yes');

const intFrom = (min, max, fallback) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const secret = (min = 32) =>
  z.string().min(min, `must be at least ${min} characters`);

const csvOrigins = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .refine((list) => list.every((o) => /^https?:\/\/[^*\s]+$/.test(o)), {
    message: 'CORS_ALLOWED_ORIGINS must be exact http(s) origins; wildcards are not allowed',
  });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: intFrom(1, 65535, 4000),
    API_HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: intFrom(0, 10, 1),

    DATABASE_URL: z.string().startsWith('mysql://', 'DATABASE_URL must be a mysql:// URL'),
    REDIS_URL: z.string().startsWith('redis'),
    REDIS_KEY_PREFIX: z.string().default('dhofar:'),

    OTP_PEPPER: secret(),
    CIVIL_ID_PEPPER: secret(),
    CIVIL_ID_ENC_KEY: z.string().min(43, 'CIVIL_ID_ENC_KEY must be base64url of 32 bytes'),
    SESSION_SECRET: secret(),
    COOKIE_DOMAIN: z.string().optional().default(''),
    COOKIE_SECURE: booleanish.default(false),

    CITIZEN_IDLE_TIMEOUT_SECONDS: intFrom(30, 3600, 120),
    CITIZEN_ABSOLUTE_TIMEOUT_SECONDS: intFrom(120, 86400, 1800),
    CITIZEN_IDLE_WARNING_SECONDS: intFrom(5, 300, 30),
    STAFF_ACCESS_TTL_SECONDS: intFrom(60, 86400, 900),
    STAFF_REFRESH_TTL_SECONDS: intFrom(300, 604800, 28800),

    OTP_LENGTH: intFrom(4, 10, 6),
    OTP_TTL_SECONDS: intFrom(60, 1800, 300),
    OTP_RESEND_COOLDOWN_SECONDS: intFrom(15, 600, 60),
    OTP_MAX_ATTEMPTS: intFrom(1, 20, 5),
    OTP_MAX_PER_PHONE_PER_HOUR: intFrom(1, 50, 3),
    OTP_MAX_PER_IP_PER_HOUR: intFrom(1, 200, 10),

    STAFF_MAX_FAILED_LOGINS: intFrom(1, 50, 5),
    STAFF_LOCKOUT_SECONDS: intFrom(30, 86400, 900),

    RATE_LIMIT_GLOBAL_MAX: intFrom(10, 100000, 300),
    RATE_LIMIT_GLOBAL_WINDOW_SECONDS: intFrom(10, 86400, 900),
    RATE_LIMIT_LOGIN_MAX: intFrom(1, 1000, 10),
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: intFrom(10, 86400, 900),
    RATE_LIMIT_TRACKING_MAX: intFrom(1, 1000, 10),
    RATE_LIMIT_TRACKING_WINDOW_SECONDS: intFrom(10, 86400, 300),
    RATE_LIMIT_UPLOAD_MAX: intFrom(1, 1000, 20),
    RATE_LIMIT_UPLOAD_WINDOW_SECONDS: intFrom(10, 86400, 3600),

    CORS_ALLOWED_ORIGINS: csvOrigins,
    PUBLIC_KIOSK_URL: z.string().url().default('http://localhost:5173'),
    PUBLIC_ADMIN_URL: z.string().url().default('http://localhost:5174'),
    PUBLIC_TRACKING_BASE_URL: z.string().url().default('http://localhost:5173/track'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('./var/uploads'),
    S3_ENDPOINT: z.string().optional().default(''),
    S3_REGION: z.string().default('me-south-1'),
    S3_BUCKET: z.string().optional().default(''),
    S3_ACCESS_KEY_ID: z.string().optional().default(''),
    S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
    S3_FORCE_PATH_STYLE: booleanish.default(true),

    MAX_UPLOAD_BYTES: intFrom(1024, 52428800, 10485760),
    MAX_ATTACHMENTS_PER_REQUEST: intFrom(1, 20, 5),

    MALWARE_SCAN_ENABLED: booleanish.default(false),
    MALWARE_SCANNER_DRIVER: z.enum(['noop', 'clamav']).default('noop'),
    CLAMAV_HOST: z.string().default('clamav'),
    CLAMAV_PORT: intFrom(1, 65535, 3310),

    SMS_DRIVER: z.enum(['mock', 'http']).default('mock'),
    SMS_SENDER_ID: z.string().default('DhofarMun'),
    SMS_HTTP_ENDPOINT: z.string().optional().default(''),
    SMS_HTTP_API_KEY: z.string().optional().default(''),
    SMS_HTTP_TIMEOUT_MS: intFrom(500, 60000, 5000),

    SWAGGER_ENABLED: booleanish.default(true),
  })
  .superRefine((env, ctx) => {
    const fail = (path, message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (env.CITIZEN_ABSOLUTE_TIMEOUT_SECONDS <= env.CITIZEN_IDLE_TIMEOUT_SECONDS) {
      fail(
        'CITIZEN_ABSOLUTE_TIMEOUT_SECONDS',
        'must be greater than CITIZEN_IDLE_TIMEOUT_SECONDS',
      );
    }
    if (env.CITIZEN_IDLE_WARNING_SECONDS >= env.CITIZEN_IDLE_TIMEOUT_SECONDS) {
      fail('CITIZEN_IDLE_WARNING_SECONDS', 'must be shorter than the idle timeout');
    }
    if (env.STAFF_REFRESH_TTL_SECONDS <= env.STAFF_ACCESS_TTL_SECONDS) {
      fail('STAFF_REFRESH_TTL_SECONDS', 'must outlive STAFF_ACCESS_TTL_SECONDS');
    }
    if (env.STORAGE_DRIVER === 's3' && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID)) {
      fail('S3_BUCKET', 'S3_BUCKET and S3_ACCESS_KEY_ID are required when STORAGE_DRIVER=s3');
    }
    if (env.SMS_DRIVER === 'http' && !env.SMS_HTTP_ENDPOINT) {
      fail('SMS_HTTP_ENDPOINT', 'required when SMS_DRIVER=http');
    }
    if (env.MALWARE_SCAN_ENABLED && env.MALWARE_SCANNER_DRIVER === 'noop') {
      fail('MALWARE_SCANNER_DRIVER', 'cannot be "noop" while MALWARE_SCAN_ENABLED=true');
    }

    // Secrets must be distinct: reusing one pepper for two purposes lets a leak
    // in one subsystem compromise the other.
    const secrets = [env.OTP_PEPPER, env.CIVIL_ID_PEPPER, env.SESSION_SECRET, env.CIVIL_ID_ENC_KEY];
    if (new Set(secrets).size !== secrets.length) {
      fail('SESSION_SECRET', 'OTP_PEPPER, CIVIL_ID_PEPPER, CIVIL_ID_ENC_KEY and SESSION_SECRET must all differ');
    }

    if (env.NODE_ENV === 'production') {
      for (const key of ['OTP_PEPPER', 'CIVIL_ID_PEPPER', 'CIVIL_ID_ENC_KEY', 'SESSION_SECRET']) {
        if (/CHANGE_ME|example|placeholder|test/i.test(env[key])) {
          fail(key, 'still contains a development placeholder');
        }
      }
      if (env.CORS_ALLOWED_ORIGINS.length === 0) {
        fail('CORS_ALLOWED_ORIGINS', 'must list at least one origin in production');
      }
      if (env.CORS_ALLOWED_ORIGINS.some((o) => o.startsWith('http://'))) {
        fail('CORS_ALLOWED_ORIGINS', 'plain http origins are not allowed in production');
      }
      if (env.SMS_DRIVER === 'mock') {
        fail('SMS_DRIVER', 'the mock SMS provider must not be used in production');
      }
      if (!env.MALWARE_SCAN_ENABLED) {
        fail('MALWARE_SCAN_ENABLED', 'must be true in production');
      }
      if (env.SWAGGER_ENABLED) {
        fail('SWAGGER_ENABLED', 'disable the API explorer in production');
      }
    }
  });

let cached = null;

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    // Names only. Values are never printed - they are the secrets.
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export function getEnv() {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Test helper: forget the memoised value so a new process env can be loaded. */
export function resetEnvCache() {
  cached = null;
}
