import { PrismaClient } from '@prisma/client';

import { getConfig } from '../config/index.js';
import { logger } from './logger.js';

const config = getConfig();

/**
 * The single Prisma client. Only repositories and this module import it; no
 * controller or service touches Prisma directly (see docs/02-architecture.md).
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: config.database.url } },
  log: config.isDevelopment
    ? [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ]
    : [{ emit: 'event', level: 'error' }],
});

prisma.$on('error', (event) => {
  logger.error({ target: event.target }, 'prisma error');
});

if (config.isDevelopment) {
  prisma.$on('warn', (event) => {
    logger.warn({ target: event.target, message: event.message }, 'prisma warning');
  });
}

export async function connectPrisma() {
  await prisma.$connect();
  logger.info('database connection established');
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}

export async function pingDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

export default prisma;
