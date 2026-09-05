import { getConfig } from './config/index.js';
import { logger } from './infra/logger.js';
import { connectPrisma, disconnectPrisma } from './infra/prisma.js';
import { connectRedis, disconnectRedis } from './infra/redis.js';
import { initStorage } from './infra/storage/index.js';
import { runMaintenanceSweep } from './modules/health/health.service.js';
import { createApp } from './app.js';

const config = getConfig();
const MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;

async function main() {
  // Storage and comparison are UTC everywhere; Asia/Muscat is applied only at
  // render time (packages/shared/src/time.js). Assigning TZ here (rather than at
  // module top level, where ESM hoisting would run it after every import) still
  // precedes the first Date the server constructs for a request.
  process.env.TZ = 'UTC';

  await connectRedis();
  await connectPrisma();
  await initStorage();

  const app = createApp();
  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(
      { port: config.server.port, env: config.env, storage: config.storage.driver, sms: config.sms.driver },
      'api listening',
    );
  });

  // Bound so a slow client cannot hold a socket open indefinitely.
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 15_000;

  const maintenance = setInterval(() => {
    runMaintenanceSweep().catch(() => {});
  }, MAINTENANCE_INTERVAL_MS);
  maintenance.unref();

  /**
   * Graceful shutdown: stop accepting connections, let in-flight requests
   * finish, then close Prisma and Redis. A hard exit after the grace period
   * guarantees the container does not hang on a stuck socket.
   */
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    const force = setTimeout(() => {
      logger.error('graceful shutdown timed out; exiting');
      process.exit(1);
    }, config.server.shutdownGraceMs);
    force.unref();

    clearInterval(maintenance);
    server.close(async () => {
      try {
        await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
        logger.info('shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ err: { message: error.message } }, 'error during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: { message: String(reason) } }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: { message: error.message, stack: error.stack } }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.fatal({ err: { message: error.message, stack: error.stack } }, 'failed to start');
  process.exit(1);
});
