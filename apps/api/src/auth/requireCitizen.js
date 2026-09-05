import { COOKIE_NAMES, ERROR_CODE } from '@dhofar/shared';

import prisma from '../infra/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { AUTH_EVENT, recordAuthEvent } from '../utils/audit.js';
import { clearCitizenCookie, touchCitizenSession } from './citizenSession.js';

/**
 * Citizen authentication guard.
 *
 * Every authenticated citizen request passes through here, which is exactly
 * where the idle clock is evaluated and slid. There is no code path that reads
 * citizen data without first having gone through this function.
 */
export async function requireCitizen(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAMES.CITIZEN_SESSION];
    const result = await touchCitizenSession(token);

    if (result.state === 'EXPIRED') {
      clearCitizenCookie(res);
      await recordAuthEvent({
        actorType: 'CITIZEN',
        eventType: AUTH_EVENT.CITIZEN_SESSION_EXPIRED,
        success: false,
        reason: 'idle or absolute timeout',
        req,
      });
      throw ApiError.sessionExpired();
    }

    if (result.state !== 'VALID') {
      clearCitizenCookie(res);
      throw ApiError.unauthenticated(ERROR_CODE.UNAUTHENTICATED, 'Please sign in to continue.');
    }

    const citizen = await prisma.citizen.findUnique({
      where: { id: result.citizenId },
      select: { id: true, phoneNumber: true, fullName: true },
    });

    if (!citizen) {
      clearCitizenCookie(res);
      throw ApiError.unauthenticated(ERROR_CODE.UNAUTHENTICATED, 'Please sign in to continue.');
    }

    req.citizen = citizen;
    req.citizenSession = {
      id: result.sessionId,
      expiresInSeconds: result.expiresInSeconds,
      absoluteExpiresAt: result.absoluteExpiresAt,
    };

    // Lets the kiosk render an accurate countdown from the server's own clock.
    res.setHeader('X-Session-Expires-In', String(result.expiresInSeconds));
    next();
  } catch (error) {
    next(error);
  }
}

export default requireCitizen;
