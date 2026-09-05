import { COOKIE_NAMES } from '@dhofar/shared';

import { getConfig } from '../config/index.js';
import prisma from '../infra/prisma.js';
import { redis, redisKeys } from '../infra/redis.js';
import { hashSessionToken, issueSessionToken, newFamilyId } from '../infra/crypto/tokens.js';

const config = getConfig();

/**
 * Staff sessions.
 *
 * Access token: 15 minutes, state in Redis only - short-lived enough that a
 * durable row would be noise.
 *
 * Refresh token: 8 hours, durable row, ROTATED on every use. The previous token
 * is marked rotated rather than deleted, so presenting it again is detectable:
 * that means the token was stolen (or the family was cloned), and the entire
 * family is revoked immediately.
 */

export async function createStaffSession({ staffId, req, familyId = newFamilyId() }) {
  const access = issueSessionToken();
  const refresh = issueSessionToken();
  const now = Date.now();

  await redis.set(
    redisKeys.staffAccess(access.tokenHash),
    JSON.stringify({ staffId, familyId, issuedAt: now }),
    'EX',
    config.session.staffAccessSeconds,
  );

  await prisma.staffSession.create({
    data: {
      staffId,
      tokenHash: refresh.tokenHash,
      familyId,
      userAgent: req?.get?.('user-agent')?.slice(0, 255) ?? null,
      ipAddress: req?.ip ? String(req.ip).slice(0, 64) : null,
      expiresAt: new Date(now + config.session.staffRefreshSeconds * 1000),
    },
  });

  return { accessToken: access.token, refreshToken: refresh.token, familyId };
}

export async function resolveStaffAccessToken(token) {
  if (!token) return null;
  const raw = await redis.get(redisKeys.staffAccess(hashSessionToken(token)));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Rotation with reuse detection.
 * @returns {Promise<{state:'ROTATED',accessToken,refreshToken,staffId}
 *                  |{state:'INVALID'|'EXPIRED'|'REUSED'}>}
 */
export async function rotateStaffSession(refreshToken, req) {
  if (!refreshToken) return { state: 'INVALID' };
  const tokenHash = hashSessionToken(refreshToken);
  const row = await prisma.staffSession.findUnique({ where: { tokenHash } });

  if (!row) return { state: 'INVALID' };

  if (row.rotatedAt || row.revokedAt) {
    // A token that was already exchanged is being presented again: assume theft.
    await revokeStaffFamily(row.familyId);
    return { state: 'REUSED', staffId: row.staffId, familyId: row.familyId };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.staffSession.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return { state: 'EXPIRED' };
  }

  const staff = await prisma.staff.findUnique({ where: { id: row.staffId }, select: { isActive: true } });
  if (!staff?.isActive) {
    await revokeStaffFamily(row.familyId);
    return { state: 'INVALID' };
  }

  await prisma.staffSession.update({
    where: { id: row.id },
    data: { rotatedAt: new Date(), revokedAt: new Date() },
  });

  const issued = await createStaffSession({ staffId: row.staffId, req, familyId: row.familyId });
  return { state: 'ROTATED', ...issued, staffId: row.staffId };
}

export async function revokeStaffAccessToken(token) {
  if (!token) return;
  await redis.del(redisKeys.staffAccess(hashSessionToken(token)));
}

export async function revokeStaffRefreshToken(token) {
  if (!token) return;
  await prisma.staffSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeStaffFamily(familyId) {
  await prisma.staffSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllStaffSessions(staffId) {
  await prisma.staffSession.updateMany({
    where: { staffId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function baseCookie() {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    domain: config.cookies.domain,
  };
}

export function setStaffCookies(res, { accessToken, refreshToken }) {
  res.cookie(COOKIE_NAMES.STAFF_ACCESS, accessToken, {
    ...baseCookie(),
    path: '/',
    maxAge: config.session.staffAccessSeconds * 1000,
  });
  // The refresh cookie is scoped to the single endpoint that consumes it, so it
  // is not attached to every ordinary API call.
  res.cookie(COOKIE_NAMES.STAFF_REFRESH, refreshToken, {
    ...baseCookie(),
    path: '/api/v1/auth/staff',
    maxAge: config.session.staffRefreshSeconds * 1000,
  });
}

export function clearStaffCookies(res) {
  res.clearCookie(COOKIE_NAMES.STAFF_ACCESS, { ...baseCookie(), path: '/' });
  res.clearCookie(COOKIE_NAMES.STAFF_REFRESH, { ...baseCookie(), path: '/api/v1/auth/staff' });
}

export async function purgeExpiredStaffSessions(now = new Date()) {
  const result = await prisma.staffSession.updateMany({
    where: { revokedAt: null, expiresAt: { lte: now } },
    data: { revokedAt: now },
  });
  return result.count;
}
