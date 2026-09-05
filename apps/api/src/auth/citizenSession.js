import { COOKIE_NAMES } from '@dhofar/shared';

import { getConfig } from '../config/index.js';
import prisma from '../infra/prisma.js';
import { redis, redisKeys } from '../infra/redis.js';
import { hashSessionToken, issueSessionToken } from '../infra/crypto/tokens.js';

const config = getConfig();

/**
 * Citizen session lifecycle.
 *
 * Two clocks, deliberately:
 *   - idle (2 minutes) slides on every authenticated request;
 *   - absolute (30 minutes) never slides.
 *
 * Both are evaluated on the SERVER. The kiosk's own timer exists only to draw a
 * warning; freezing or patching it in the browser changes nothing, because the
 * next request is still measured against `lastSeenAt` in Redis and MySQL.
 *
 * Redis is the hot path. MySQL holds the durable row so that a Redis flush
 * cannot silently resurrect an expired session and so the audit trail survives.
 */

function nowMs() {
  return Date.now();
}

export async function createCitizenSession({ citizenId, kioskId = null, ipAddress = null }) {
  const { token, tokenHash } = issueSessionToken();
  const created = nowMs();
  const idleExpiresAt = new Date(created + config.session.citizenIdleSeconds * 1000);
  const absoluteExpiresAt = new Date(created + config.session.citizenAbsoluteSeconds * 1000);

  const session = await prisma.citizenSession.create({
    data: {
      citizenId,
      tokenHash,
      kioskId: kioskId ? String(kioskId).slice(0, 64) : null,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 64) : null,
      lastSeenAt: new Date(created),
      idleExpiresAt,
      absoluteExpiresAt,
    },
  });

  await redis.set(
    redisKeys.citizenSession(tokenHash),
    JSON.stringify({
      sessionId: session.id,
      citizenId,
      lastSeenAt: created,
      absoluteExpiresAt: absoluteExpiresAt.getTime(),
    }),
    'PX',
    config.session.citizenIdleSeconds * 1000,
  );

  return { token, session, absoluteExpiresAt };
}

/**
 * @returns {Promise<{state:'VALID',citizenId:string,sessionId:string,expiresInSeconds:number}
 *                  |{state:'EXPIRED'|'MISSING'}>}
 */
export async function touchCitizenSession(token) {
  if (!token) return { state: 'MISSING' };
  const tokenHash = hashSessionToken(token);
  const key = redisKeys.citizenSession(tokenHash);
  const now = nowMs();

  const cached = await redis.get(key);
  let state = cached ? JSON.parse(cached) : null;

  if (!state) {
    // Redis miss: fall back to the durable row (restart, eviction, failover).
    const row = await prisma.citizenSession.findUnique({ where: { tokenHash } });
    if (!row || row.revokedAt) return { state: 'MISSING' };
    if (row.idleExpiresAt.getTime() <= now || row.absoluteExpiresAt.getTime() <= now) {
      await revokeCitizenSessionByHash(tokenHash, 'expired');
      return { state: 'EXPIRED' };
    }
    state = {
      sessionId: row.id,
      citizenId: row.citizenId,
      lastSeenAt: row.lastSeenAt.getTime(),
      absoluteExpiresAt: row.absoluteExpiresAt.getTime(),
    };
  }

  const idleDeadline = state.lastSeenAt + config.session.citizenIdleSeconds * 1000;
  if (now >= idleDeadline || now >= state.absoluteExpiresAt) {
    await revokeCitizenSessionByHash(tokenHash, 'expired');
    return { state: 'EXPIRED' };
  }

  // Slide the idle clock only. The absolute deadline is untouched.
  const nextIdleExpiry = new Date(now + config.session.citizenIdleSeconds * 1000);
  const ttlMs = Math.max(1, Math.min(nextIdleExpiry.getTime(), state.absoluteExpiresAt) - now);

  await redis.set(
    key,
    JSON.stringify({ ...state, lastSeenAt: now }),
    'PX',
    ttlMs,
  );

  // The durable row is refreshed asynchronously; a lost write only shortens the
  // session, never extends it, because Redis holds the authoritative slide.
  prisma.citizenSession
    .updateMany({
      where: { tokenHash, revokedAt: null },
      data: { lastSeenAt: new Date(now), idleExpiresAt: nextIdleExpiry },
    })
    .catch(() => {});

  return {
    state: 'VALID',
    citizenId: state.citizenId,
    sessionId: state.sessionId,
    expiresInSeconds: Math.floor(ttlMs / 1000),
    absoluteExpiresAt: new Date(state.absoluteExpiresAt).toISOString(),
  };
}

export async function revokeCitizenSessionByToken(token, reason = 'logout') {
  if (!token) return;
  await revokeCitizenSessionByHash(hashSessionToken(token), reason);
}

export async function revokeCitizenSessionByHash(tokenHash, _reason = 'logout') {
  await redis.del(redisKeys.citizenSession(tokenHash));
  await prisma.citizenSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Used when a citizen re-authenticates: one live session per citizen. */
export async function revokeAllCitizenSessions(citizenId) {
  const sessions = await prisma.citizenSession.findMany({
    where: { citizenId, revokedAt: null },
    select: { tokenHash: true },
  });
  if (sessions.length > 0) {
    await redis.del(...sessions.map((s) => redisKeys.citizenSession(s.tokenHash)));
  }
  await prisma.citizenSession.updateMany({
    where: { citizenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function citizenCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    domain: config.cookies.domain,
    path: config.cookies.path,
    // Deliberately a session cookie: no maxAge, so closing the kiosk browser
    // discards it even if the server-side row somehow survives.
  };
}

export function setCitizenCookie(res, token) {
  res.cookie(COOKIE_NAMES.CITIZEN_SESSION, token, citizenCookieOptions());
}

export function clearCitizenCookie(res) {
  res.clearCookie(COOKIE_NAMES.CITIZEN_SESSION, citizenCookieOptions());
}

/** Lazy sweep of rows whose clocks have run out. Called by the health module. */
export async function purgeExpiredCitizenSessions(now = new Date()) {
  const result = await prisma.citizenSession.updateMany({
    where: {
      revokedAt: null,
      OR: [{ idleExpiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }],
    },
    data: { revokedAt: now },
  });
  return result.count;
}
