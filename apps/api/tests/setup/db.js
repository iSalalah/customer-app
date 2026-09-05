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
 * Deletion order follows the foreign keys: children first. A plain DELETE is
 * used rather than TRUNCATE, and the foreign keys stay ENABLED.
 *
 * The earlier version disabled them with `SET FOREIGN_KEY_CHECKS = 0` before
 * truncating. That is a **session** variable, and Prisma runs statements over a
 * connection pool - so the SET and the TRUNCATE could land on different
 * connections, leaving the checks on for the truncate. It passed locally, where
 * the pool happened to reuse one connection, and failed on CI, where it did not.
 *
 * Ordering the deletes correctly removes the need for the flag altogether, and
 * the ordering is verified against the live schema by `assertCoversAllTables`.
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

let tableCoverageChecked = false;

/**
 * Fails loudly if the schema gains a table that the reset list does not clear.
 * Without this, a new table would silently leak rows between suites and produce
 * failures far away from the cause.
 */
async function assertCoversAllTables(client) {
  if (tableCoverageChecked) return;
  tableCoverageChecked = true;

  const rows = await client.$queryRawUnsafe(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );

  const known = new Set([...TABLES_IN_DELETE_ORDER, '_prisma_migrations']);
  const missing = rows.map((row) => row.name).filter((name) => !known.has(name));

  if (missing.length > 0) {
    throw new Error(
      `tests/setup/db.js does not reset these tables: ${missing.join(', ')}. ` +
        'Add them to TABLES_IN_DELETE_ORDER, children before parents.',
    );
  }
}

export async function resetDatabase() {
  const client = getTestPrisma();
  await assertCoversAllTables(client);

  // One transaction, therefore one connection - and the child-before-parent
  // order means the foreign keys never need to be disabled.
  await client.$transaction(
    TABLES_IN_DELETE_ORDER.map((table) => client.$executeRawUnsafe(`DELETE FROM \`${table}\``)),
  );
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
