/**
 * Test environment.
 *
 * Every value here is a throwaway. The real secrets never appear in the repo,
 * and NODE_ENV=test keeps the SMS provider on the in-memory mock so no test can
 * dispatch a real message.
 *
 * Integration tests additionally need TEST_DATABASE_URL and TEST_REDIS_URL; when
 * they are absent those suites skip with an explicit message rather than
 * failing, so `npm test` is useful without Docker running.
 */
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://dhofar:dhofar@localhost:3306/dhofar_portal_test?timezone=UTC';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.REDIS_KEY_PREFIX = 'dhofar-test:';

process.env.OTP_PEPPER = 'test-otp-pepper-value-at-least-32-chars-long';
process.env.CIVIL_ID_PEPPER = 'test-civil-id-pepper-value-at-least-32-chars';
// base64url of 32 deterministic bytes.
process.env.CIVIL_ID_ENC_KEY = 'dGVzdC1jaXZpbC1pZC1lbmNyeXB0aW9uLWtleS0zMmJ5';
process.env.SESSION_SECRET = 'test-session-secret-value-at-least-32-chars';

process.env.COOKIE_SECURE = 'false';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:5174';
process.env.PUBLIC_TRACKING_BASE_URL = 'http://localhost:5173/track';

process.env.CITIZEN_IDLE_TIMEOUT_SECONDS = '120';
process.env.CITIZEN_ABSOLUTE_TIMEOUT_SECONDS = '1800';
process.env.STAFF_ACCESS_TTL_SECONDS = '900';
process.env.STAFF_REFRESH_TTL_SECONDS = '28800';

process.env.SMS_DRIVER = 'mock';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_ROOT = './var/test-uploads';
process.env.MALWARE_SCAN_ENABLED = 'false';
process.env.SWAGGER_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
