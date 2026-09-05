import { maskPhone } from '@dhofar/shared';

import prisma from '../infra/prisma.js';
import { logger } from '../infra/logger.js';

/**
 * Authentication audit writer.
 *
 * Auditing must never break the flow it is auditing: a failure to write the row
 * is logged and swallowed, because refusing a valid login because the audit
 * table is full would be a worse outcome than a missing row.
 */
export const AUTH_EVENT = Object.freeze({
  STAFF_LOGIN_SUCCESS: 'STAFF_LOGIN_SUCCESS',
  STAFF_LOGIN_FAILURE: 'STAFF_LOGIN_FAILURE',
  STAFF_LOGIN_LOCKED: 'STAFF_LOGIN_LOCKED',
  STAFF_LOGOUT: 'STAFF_LOGOUT',
  STAFF_REFRESH_SUCCESS: 'STAFF_REFRESH_SUCCESS',
  STAFF_REFRESH_REUSE_DETECTED: 'STAFF_REFRESH_REUSE_DETECTED',
  CITIZEN_OTP_REQUESTED: 'CITIZEN_OTP_REQUESTED',
  CITIZEN_OTP_VERIFY_SUCCESS: 'CITIZEN_OTP_VERIFY_SUCCESS',
  CITIZEN_OTP_VERIFY_FAILURE: 'CITIZEN_OTP_VERIFY_FAILURE',
  CITIZEN_LOGOUT: 'CITIZEN_LOGOUT',
  CITIZEN_SESSION_EXPIRED: 'CITIZEN_SESSION_EXPIRED',
});

export async function recordAuthEvent({
  actorType,
  eventType,
  actorId = null,
  identifier = null,
  success,
  reason = null,
  req,
}) {
  try {
    await prisma.authenticationAudit.create({
      data: {
        actorType,
        eventType,
        actorId,
        identifier: identifier ? identifier.slice(0, 120) : null,
        success,
        reason: reason ? reason.slice(0, 120) : null,
        ipAddress: req?.ip ? String(req.ip).slice(0, 64) : null,
        userAgent: req?.get?.('user-agent') ? String(req.get('user-agent')).slice(0, 255) : null,
        requestId: req?.id ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: { message: error.message }, eventType }, 'failed to write authentication audit');
  }
}

/** Phone numbers enter the audit table masked, never in full. */
export function auditIdentifierForPhone(phoneNumber) {
  return maskPhone(phoneNumber);
}
