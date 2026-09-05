import { ERROR_CODE, maskPhone, normalizeOmanPhone } from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { redis, redisKeys } from '../../infra/redis.js';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../../infra/crypto/otp.js';
import { getSmsProvider } from '../../infra/sms/index.js';
import { logger } from '../../infra/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { AUTH_EVENT, auditIdentifierForPhone, recordAuthEvent } from '../../utils/audit.js';
import {
  createCitizenSession,
  revokeAllCitizenSessions,
  revokeCitizenSessionByToken,
} from '../../auth/citizenSession.js';
import * as repository from './citizenAuth.repository.js';

const config = getConfig();

/**
 * Citizen OTP authentication.
 *
 * Two properties govern every response shape in this file:
 *   1. A caller must not learn whether a phone number belongs to a citizen.
 *      Both the request and the resend endpoint therefore answer identically
 *      for known and unknown numbers.
 *   2. A caller must not learn WHY a verification failed. Expired, wrong,
 *      superseded and never-issued all return the same OTP_INVALID.
 */

function assertPhone(raw) {
  const phoneNumber = normalizeOmanPhone(raw);
  if (!phoneNumber) {
    throw ApiError.badRequest(ERROR_CODE.VALIDATION_ERROR, 'Enter a valid Oman mobile number.', {
      details: [{ path: 'phoneNumber', message: 'Invalid Oman mobile number', messageAr: 'رقم هاتف عماني غير صالح' }],
    });
  }
  return phoneNumber;
}

/** Fixed-window counters in Redis; the TTL is set only when the key is created. */
async function bumpCounter(key, ttlSeconds) {
  const value = await redis.incr(key);
  if (value === 1) await redis.expire(key, ttlSeconds);
  return value;
}

async function enforceSendingBudget(phoneNumber, ip) {
  const [perPhone, perIp] = await Promise.all([
    bumpCounter(redisKeys.otpPhoneHourly(phoneNumber), 3600),
    bumpCounter(redisKeys.otpIpHourly(ip ?? 'unknown'), 3600),
  ]);

  if (perPhone > config.otp.maxPerPhonePerHour || perIp > config.otp.maxPerIpPerHour) {
    throw ApiError.tooManyRequests('Too many verification code requests. Please try again later.', {
      meta: { retryAfterSeconds: 3600 },
      headers: { 'Retry-After': '3600' },
    });
  }
}

async function remainingCooldown(phoneNumber) {
  const ttl = await redis.ttl(redisKeys.otpCooldown(phoneNumber));
  return ttl > 0 ? ttl : 0;
}

/**
 * Issues a challenge. Always resolves to the same shape, so timing and body are
 * uninformative about whether the citizen exists.
 */
async function issueChallenge({ phoneNumber, req, isResend }) {
  const cooldown = await remainingCooldown(phoneNumber);
  if (cooldown > 0) {
    throw ApiError.tooManyRequests('Please wait before requesting another code.', {
      meta: { retryAfterSeconds: cooldown },
      headers: { 'Retry-After': String(cooldown) },
    });
  }

  await enforceSendingBudget(phoneNumber, req?.ip);

  const code = generateOtpCode(config.otp.length);
  const now = Date.now();
  const expiresAt = new Date(now + config.otp.ttlSeconds * 1000);
  const resendAvailableAt = new Date(now + config.otp.resendCooldownSeconds * 1000);

  await repository.createOtpChallenge({
    phoneNumber,
    codeHash: hashOtpCode(phoneNumber, code),
    expiresAt,
    resendAvailableAt,
    maxAttempts: config.otp.maxAttempts,
    ipAddress: req?.ip,
  });

  await redis.set(redisKeys.otpCooldown(phoneNumber), '1', 'EX', config.otp.resendCooldownSeconds);

  // The code leaves the process here and nowhere else.
  const delivery = await getSmsProvider().sendOtp(phoneNumber, code);
  if (!delivery.accepted) {
    logger.error({ to: maskPhone(phoneNumber) }, 'otp delivery was not accepted by the provider');
  }

  await recordAuthEvent({
    actorType: 'CITIZEN',
    eventType: AUTH_EVENT.CITIZEN_OTP_REQUESTED,
    identifier: auditIdentifierForPhone(phoneNumber),
    success: true,
    reason: isResend ? 'resend' : 'request',
    req,
  });

  return {
    expiresInSeconds: config.otp.ttlSeconds,
    resendAvailableInSeconds: config.otp.resendCooldownSeconds,
    maxAttempts: config.otp.maxAttempts,
  };
}

export async function requestOtp({ phoneNumber: raw, req }) {
  const phoneNumber = assertPhone(raw);
  return issueChallenge({ phoneNumber, req, isResend: false });
}

export async function resendOtp({ phoneNumber: raw, req }) {
  const phoneNumber = assertPhone(raw);
  return issueChallenge({ phoneNumber, req, isResend: true });
}

export async function verifyOtp({ phoneNumber: raw, code, req, res }) {
  const phoneNumber = assertPhone(raw);
  const challenge = await repository.findActiveChallenge(phoneNumber);
  const now = Date.now();

  const genericFailure = async (reason) => {
    await recordAuthEvent({
      actorType: 'CITIZEN',
      eventType: AUTH_EVENT.CITIZEN_OTP_VERIFY_FAILURE,
      identifier: auditIdentifierForPhone(phoneNumber),
      success: false,
      reason,
      req,
    });
    // One code, one message: no distinction between wrong, expired and absent.
    return ApiError.unauthenticated(ERROR_CODE.OTP_INVALID, 'The verification code is incorrect or has expired.');
  };

  if (!challenge) throw await genericFailure('no active challenge');

  if (challenge.expiresAt.getTime() <= now) {
    await repository.invalidateChallenge(challenge.id);
    throw await genericFailure('expired');
  }

  if (challenge.attemptCount >= challenge.maxAttempts) {
    await repository.invalidateChallenge(challenge.id);
    throw ApiError.locked(
      ERROR_CODE.OTP_LOCKED,
      'Too many incorrect attempts. Please request a new code.',
      { meta: { retryAfterSeconds: config.otp.resendCooldownSeconds } },
    );
  }

  const matches = verifyOtpCode(phoneNumber, code, challenge.codeHash);

  if (!matches) {
    const { attemptCount, maxAttempts } = await repository.incrementAttempt(challenge.id);
    if (attemptCount >= maxAttempts) {
      await repository.invalidateChallenge(challenge.id);
      await recordAuthEvent({
        actorType: 'CITIZEN',
        eventType: AUTH_EVENT.CITIZEN_OTP_VERIFY_FAILURE,
        identifier: auditIdentifierForPhone(phoneNumber),
        success: false,
        reason: 'attempt limit reached',
        req,
      });
      throw ApiError.locked(
        ERROR_CODE.OTP_LOCKED,
        'Too many incorrect attempts. Please request a new code.',
        { meta: { retryAfterSeconds: config.otp.resendCooldownSeconds } },
      );
    }
    throw await genericFailure('incorrect code');
  }

  // Correct: burn the challenge before anything else, so a replayed request
  // cannot ride the same code.
  await repository.consumeChallenge(challenge.id);

  const citizen =
    (await repository.findCitizenByPhone(phoneNumber)) ?? (await repository.createCitizen(phoneNumber));

  // One live session per citizen: signing in on a second kiosk ends the first.
  await revokeAllCitizenSessions(citizen.id);

  const { token, absoluteExpiresAt } = await createCitizenSession({
    citizenId: citizen.id,
    kioskId: req?.get?.('x-kiosk-id') ?? null,
    ipAddress: req?.ip,
  });

  await recordAuthEvent({
    actorType: 'CITIZEN',
    eventType: AUTH_EVENT.CITIZEN_OTP_VERIFY_SUCCESS,
    actorId: citizen.id,
    identifier: auditIdentifierForPhone(phoneNumber),
    success: true,
    req,
  });

  return {
    token,
    citizen,
    session: {
      idleTimeoutSeconds: config.session.citizenIdleSeconds,
      idleWarningSeconds: config.session.citizenIdleWarningSeconds,
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    },
    res,
  };
}

export async function logout({ token, citizenId, req }) {
  await revokeCitizenSessionByToken(token, 'logout');
  await recordAuthEvent({
    actorType: 'CITIZEN',
    eventType: AUTH_EVENT.CITIZEN_LOGOUT,
    actorId: citizenId ?? null,
    success: true,
    req,
  });
}
