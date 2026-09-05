import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { ERROR_CODE, normalizeOmanPhone } from '@dhofar/shared';

import { getConfig } from '../config/index.js';
import { redis } from '../infra/redis.js';
import { buildErrorBody } from '../utils/respond.js';

const config = getConfig();

/**
 * Rate limiters.
 *
 * All counters live in Redis so that limits hold across API replicas - an
 * in-memory limiter would be bypassed simply by hitting a different container.
 *
 * The test environment uses Redis too, deliberately: an in-memory store would
 * survive the suite's `resetRedis()` and leak one test's exhausted bucket into
 * the next, and it would exercise a different code path from production.
 */
function store(prefix) {
  return new RedisStore({
    prefix: `${config.redis.keyPrefix}rl:${prefix}:`,
    sendCommand: (...args) => redis.call(...args),
  });
}

function handler(message) {
  return (req, res, _next, options) => {
    const retryAfter = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      ...buildErrorBody({
        code: ERROR_CODE.RATE_LIMITED,
        message,
        requestId: req.id,
      }),
      meta: { retryAfterSeconds: retryAfter },
    });
  };
}

function build({ prefix, windowSeconds, max, message, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs: windowSeconds * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    store: store(prefix),
    keyGenerator,
    handler: handler(message),
  });
}

/**
 * IPv6-safe key. A single IPv6 client is routinely handed a /64, so keying on
 * the full address would let one host cycle through billions of buckets.
 * Addresses are therefore truncated to their /64 prefix; IPv4 is used whole.
 */
function byIp(req) {
  const ip = String(req.ip ?? 'unknown');
  if (!ip.includes(':')) return ip;
  const groups = ip.split('%')[0].split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export const globalLimiter = build({
  prefix: 'global',
  windowSeconds: config.rateLimits.global.windowSeconds,
  max: config.rateLimits.global.max,
  message: 'Too many requests from this device. Please wait a moment.',
  keyGenerator: byIp,
});

/**
 * OTP request limiter, keyed on the normalised phone number so that rotating
 * source IPs does not multiply an attacker's SMS budget. The per-phone hourly
 * cap is additionally enforced in the service against Redis counters.
 */
export const otpRequestLimiter = build({
  prefix: 'otp',
  windowSeconds: 900,
  max: 5,
  message: 'Too many verification code requests. Please wait before trying again.',
  keyGenerator: (req) => {
    const phone = normalizeOmanPhone(req.body?.phoneNumber);
    return phone ? `p:${phone}` : `i:${byIp(req)}`;
  },
});

export const otpVerifyLimiter = build({
  prefix: 'otpv',
  windowSeconds: 900,
  max: 15,
  message: 'Too many verification attempts. Please wait before trying again.',
  keyGenerator: (req) => {
    const phone = normalizeOmanPhone(req.body?.phoneNumber);
    return phone ? `p:${phone}` : `i:${byIp(req)}`;
  },
  skipSuccessfulRequests: true,
});

export const staffLoginLimiter = build({
  prefix: 'login',
  windowSeconds: config.rateLimits.login.windowSeconds,
  max: config.rateLimits.login.max,
  message: 'Too many sign-in attempts. Please wait before trying again.',
  keyGenerator: byIp,
  skipSuccessfulRequests: true,
});

/** The enumeration control for public tracking (docs/07-security.md, T3). */
export const trackingLimiter = build({
  prefix: 'track',
  windowSeconds: config.rateLimits.tracking.windowSeconds,
  max: config.rateLimits.tracking.max,
  message: 'Too many tracking lookups. Please wait before trying again.',
  keyGenerator: byIp,
});

export const uploadLimiter = build({
  prefix: 'upload',
  windowSeconds: config.rateLimits.upload.windowSeconds,
  max: config.rateLimits.upload.max,
  message: 'Too many uploads. Please wait before trying again.',
  keyGenerator: (req) => (req.citizen?.id ? `c:${req.citizen.id}` : `i:${byIp(req)}`),
});
