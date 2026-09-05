import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

/**
 * Integration-test harness.
 *
 * The suites that use it talk to a REAL MySQL and Redis, isolated by
 * TEST_DATABASE_URL / TEST_REDIS_URL. Nothing here ever runs against a
 * development or production datastore: `assertTestDatabase` refuses any URL
 * whose database name does not end in `_test`.
 */

export const hasTestInfrastructure = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_REDIS_URL);

/** Use in place of `describe` for suites that need the datastores. */
export const describeIntegration = hasTestInfrastructure ? describe : describe.skip;

if (!hasTestInfrastructure) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n  Integration suites skipped: set TEST_DATABASE_URL and TEST_REDIS_URL.\n' +
      '  Start them with:  docker compose up -d mysql redis\n' +
      '  See docs/08-deployment.md, "Running the tests".\n',
  );
}

function assertTestDatabase(url) {
  const name = url.split('/').pop()?.split('?')[0] ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name}": the test database name must end with _test.`,
    );
  }
}

let prisma = null;
let redis = null;

export function getTestPrisma() {
  if (!prisma) {
    assertTestDatabase(process.env.DATABASE_URL);
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  }
  return prisma;
}

export function getTestRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, { keyPrefix: process.env.REDIS_KEY_PREFIX, lazyConnect: true });
  }
  return redis;
}

/**
 * Truncation order follows the foreign keys: children first. Truncate is used
 * rather than a transaction rollback because the API opens its own transactions
 * through a separate client.
 */
const TABLES_IN_DELETE_ORDER = [
  'request_logs',
  'attachments',
  'requests',
  'citizen_sessions',
  'otp_challenges',
  'citizens',
  'staff_sessions',
  'authentication_audits',
  'staff',
  'municipal_services',
  'sections',
  'departments',
];

export async function resetDatabase() {
  const client = getTestPrisma();
  await client.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES_IN_DELETE_ORDER) {
    await client.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await client.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

export async function resetRedis() {
  const client = getTestRedis();
  if (client.status === 'wait' || client.status === 'end') await client.connect();
  // Only this suite's namespace is cleared - never FLUSHDB, which would wipe a
  // developer's other databases if the URL were ever pointed somewhere shared.
  const keys = await client.keys(`${process.env.REDIS_KEY_PREFIX}*`);
  if (keys.length > 0) {
    // keys() returns prefixed names, but del() re-applies the prefix.
    const unprefixed = keys.map((key) => key.slice(process.env.REDIS_KEY_PREFIX.length));
    await client.del(...unprefixed);
  }
}

export async function resetAll() {
  await resetDatabase();
  await resetRedis();
}

export async function closeTestConnections() {
  if (prisma) await prisma.$disconnect();
  if (redis && redis.status !== 'end') await redis.quit().catch(() => redis.disconnect());
}
