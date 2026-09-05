import Redis from 'ioredis';

import { getConfig } from '../config/index.js';
import { logger } from './logger.js';

const config = getConfig();

/**
 * Redis holds everything with a clock: citizen session state (the sliding idle
 * window), OTP counters, rate-limit buckets and the idempotency replay cache.
 * MySQL keeps the durable record; Redis keeps the hot path fast and expiring.
 */
export const redis = new Redis(config.redis.url, {
  keyPrefix: config.redis.keyPrefix,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 10) return null;
    return Math.min(times * 200, 3000);
  },
});

redis.on('error', (error) => {
  logger.error({ err: { message: error.message, code: error.code } }, 'redis error');
});

redis.on('ready', () => {
  logger.info('redis connection ready');
});

export async function connectRedis() {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

export async function disconnectRedis() {
  if (redis.status === 'end') return;
  await redis.quit().catch(() => redis.disconnect());
}

export async function pingRedis() {
  const reply = await redis.ping();
  return reply === 'PONG';
}

/** Namespaced key builders, so no key string is spelled out twice. */
export const redisKeys = Object.freeze({
  citizenSession: (sessionId) => `sess:citizen:${sessionId}`,
  staffAccess: (sessionId) => `sess:staff:${sessionId}`,
  otpPhoneHourly: (phone) => `otp:phone:h:${phone}`,
  otpIpHourly: (ip) => `otp:ip:h:${ip}`,
  otpCooldown: (phone) => `otp:cooldown:${phone}`,
  idempotency: (citizenId, key) => `idem:${citizenId}:${key}`,
  rateLimit: (bucket) => `rl:${bucket}:`,
});

export default redis;
