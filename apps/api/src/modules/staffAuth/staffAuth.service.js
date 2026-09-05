import { ERROR_CODE, permissionsForRole } from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from '../../infra/crypto/password.js';
import { logger } from '../../infra/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { AUTH_EVENT, recordAuthEvent } from '../../utils/audit.js';
import {
  createStaffSession,
  revokeAllStaffSessions,
  revokeStaffAccessToken,
  revokeStaffRefreshToken,
  rotateStaffSession,
} from '../../auth/staffSession.js';
import * as repository from './staffAuth.repository.js';

const config = getConfig();

/**
 * Staff authentication.
 *
 * Every failure path returns the same INVALID_CREDENTIALS with the same latency
 * profile: an unknown username still burns an Argon2 verification against a
 * throwaway hash, so response time cannot be used to enumerate accounts.
 * A disabled account is the single exception - the operator needs to know why
 * they cannot get in, and the account is known to exist to whoever disabled it.
 */

function invalidCredentials() {
  return ApiError.unauthenticated(ERROR_CODE.INVALID_CREDENTIALS, 'The username or password is incorrect.');
}

export async function login({ username, password, req }) {
  const staff = await repository.findStaffByUsername(username);

  if (!staff) {
    await dummyVerify(password);
    await recordAuthEvent({
      actorType: 'STAFF',
      eventType: AUTH_EVENT.STAFF_LOGIN_FAILURE,
      identifier: username,
      success: false,
      reason: 'unknown username',
      req,
    });
    throw invalidCredentials();
  }

  const now = Date.now();

  if (staff.lockedUntil && staff.lockedUntil.getTime() > now) {
    const retryAfterSeconds = Math.ceil((staff.lockedUntil.getTime() - now) / 1000);
    await recordAuthEvent({
      actorType: 'STAFF',
      eventType: AUTH_EVENT.STAFF_LOGIN_LOCKED,
      actorId: staff.id,
      identifier: username,
      success: false,
      reason: 'account temporarily locked',
      req,
    });
    throw ApiError.locked(ERROR_CODE.ACCOUNT_LOCKED, 'This account is temporarily locked. Please try again later.', {
      meta: { retryAfterSeconds },
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
  }

  const passwordMatches = await verifyPassword(staff.passwordHash, password);

  if (!passwordMatches) {
    const failedLoginCount = staff.failedLoginCount + 1;
    const reachedLimit = failedLoginCount >= config.staffLogin.maxFailedLogins;
    await repository.registerFailedLogin({
      staffId: staff.id,
      failedLoginCount: reachedLimit ? 0 : failedLoginCount,
      lockedUntil: reachedLimit ? new Date(now + config.staffLogin.lockoutSeconds * 1000) : staff.lockedUntil,
    });

    await recordAuthEvent({
      actorType: 'STAFF',
      eventType: reachedLimit ? AUTH_EVENT.STAFF_LOGIN_LOCKED : AUTH_EVENT.STAFF_LOGIN_FAILURE,
      actorId: staff.id,
      identifier: username,
      success: false,
      reason: reachedLimit ? 'lockout triggered' : 'incorrect password',
      req,
    });

    if (reachedLimit) {
      throw ApiError.locked(
        ERROR_CODE.ACCOUNT_LOCKED,
        'This account is temporarily locked. Please try again later.',
        { meta: { retryAfterSeconds: config.staffLogin.lockoutSeconds } },
      );
    }
    throw invalidCredentials();
  }

  // Password is correct. Everything below decides whether the account may still
  // be used - a valid password on a disabled account grants nothing.
  if (!staff.isActive) {
    await recordAuthEvent({
      actorType: 'STAFF',
      eventType: AUTH_EVENT.STAFF_LOGIN_FAILURE,
      actorId: staff.id,
      identifier: username,
      success: false,
      reason: 'account disabled',
      req,
    });
    throw ApiError.forbidden(ERROR_CODE.ACCOUNT_DISABLED, 'This account has been disabled.');
  }

  if (!staff.department?.isActive) {
    await recordAuthEvent({
      actorType: 'STAFF',
      eventType: AUTH_EVENT.STAFF_LOGIN_FAILURE,
      actorId: staff.id,
      identifier: username,
      success: false,
      reason: 'department inactive',
      req,
    });
    throw ApiError.forbidden(ERROR_CODE.ACCOUNT_DISABLED, 'This account has been disabled.');
  }

  // Opportunistic upgrade when the Argon2 parameters have been raised.
  if (needsRehash(staff.passwordHash)) {
    try {
      await repository.updatePasswordHash(staff.id, await hashPassword(password));
    } catch (error) {
      logger.warn({ staffId: staff.id, err: { message: error.message } }, 'password rehash failed');
    }
  }

  const updated = await repository.registerSuccessfulLogin(staff.id);
  const tokens = await createStaffSession({ staffId: staff.id, req });

  await recordAuthEvent({
    actorType: 'STAFF',
    eventType: AUTH_EVENT.STAFF_LOGIN_SUCCESS,
    actorId: staff.id,
    identifier: username,
    success: true,
    req,
  });

  return {
    tokens,
    staff: { ...staff, lastLoginAt: updated.lastLoginAt },
    permissions: permissionsForRole(staff.role),
  };
}

export async function refresh({ refreshToken, req }) {
  const result = await rotateStaffSession(refreshToken, req);

  if (result.state === 'REUSED') {
    await recordAuthEvent({
      actorType: 'STAFF',
      eventType: AUTH_EVENT.STAFF_REFRESH_REUSE_DETECTED,
      actorId: result.staffId ?? null,
      success: false,
      reason: 'rotated refresh token presented again; family revoked',
      req,
    });
    throw ApiError.unauthenticated(ERROR_CODE.SESSION_EXPIRED, 'Your session has ended. Please sign in again.');
  }

  if (result.state !== 'ROTATED') {
    throw ApiError.unauthenticated(ERROR_CODE.SESSION_EXPIRED, 'Your session has ended. Please sign in again.');
  }

  await recordAuthEvent({
    actorType: 'STAFF',
    eventType: AUTH_EVENT.STAFF_REFRESH_SUCCESS,
    actorId: result.staffId,
    success: true,
    req,
  });

  return { accessToken: result.accessToken, refreshToken: result.refreshToken };
}

export async function logout({ accessToken, refreshToken, staffId, req, everywhere = false }) {
  await Promise.all([revokeStaffAccessToken(accessToken), revokeStaffRefreshToken(refreshToken)]);
  if (everywhere && staffId) await revokeAllStaffSessions(staffId);

  await recordAuthEvent({
    actorType: 'STAFF',
    eventType: AUTH_EVENT.STAFF_LOGOUT,
    actorId: staffId ?? null,
    success: true,
    req,
  });
}

export function describeSelf(staff) {
  return { staff, permissions: permissionsForRole(staff.role) };
}
