import { pingDatabase } from '../../infra/prisma.js';
import { pingRedis } from '../../infra/redis.js';
import { purgeExpiredCitizenSessions } from '../../auth/citizenSession.js';
import { purgeExpiredStaffSessions } from '../../auth/staffSession.js';
import { purgeExpiredOtpChallenges } from '../citizenAuth/citizenAuth.repository.js';
import { logger } from '../../infra/logger.js';

const startedAt = Date.now();

export function liveness() {
  return {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness probes the dependencies the API cannot serve without. Each check is
 * reported separately so an operator can see which one is down without reading
 * the logs.
 */
export async function readiness() {
  const checks = { database: 'unknown', redis: 'unknown' };

  const [database, redisResult] = await Promise.allSettled([pingDatabase(), pingRedis()]);
  checks.database = database.status === 'fulfilled' ? 'ok' : 'down';
  checks.redis = redisResult.status === 'fulfilled' && redisResult.value ? 'ok' : 'down';

  const ready = Object.values(checks).every((value) => value === 'ok');
  return { ready, checks, timestamp: new Date().toISOString() };
}

/**
 * Lazy cleanup, invoked on a timer from server.js. Expired OTP rows and dead
 * session rows are marked/removed here rather than through a separate cron
 * service, which keeps the deployment to one process type.
 */
export async function runMaintenanceSweep() {
  try {
    const [otps, citizenSessions, staffSessions] = await Promise.all([
      purgeExpiredOtpChallenges(),
      purgeExpiredCitizenSessions(),
      purgeExpiredStaffSessions(),
    ]);
    if (otps + citizenSessions + staffSessions > 0) {
      logger.info({ otps, citizenSessions, staffSessions }, 'maintenance sweep completed');
    }
    return { otps, citizenSessions, staffSessions };
  } catch (error) {
    logger.error({ err: { message: error.message } }, 'maintenance sweep failed');
    return null;
  }
}
