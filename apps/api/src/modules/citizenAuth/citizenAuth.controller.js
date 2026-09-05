import { COOKIE_NAMES } from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendAccepted, sendSuccess } from '../../utils/respond.js';
import { serializeCitizenIdentity } from '../../utils/serializers.js';
import { clearCitizenCookie, setCitizenCookie } from '../../auth/citizenSession.js';
import * as citizenAuthService from './citizenAuth.service.js';

const config = getConfig();

export const requestOtp = asyncHandler(async (req, res) => {
  const result = await citizenAuthService.requestOtp({ phoneNumber: req.body.phoneNumber, req });
  // 202: the code has been handed to the SMS provider, nothing more is claimed.
  return sendAccepted(res, result);
});

export const resendOtp = asyncHandler(async (req, res) => {
  const result = await citizenAuthService.resendOtp({ phoneNumber: req.body.phoneNumber, req });
  return sendAccepted(res, result);
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { token, citizen, session } = await citizenAuthService.verifyOtp({
    phoneNumber: req.body.phoneNumber,
    code: req.body.code,
    req,
    res,
  });

  setCitizenCookie(res, token);

  return sendSuccess(res, {
    citizen: serializeCitizenIdentity(citizen),
    session,
  });
});

export const logout = asyncHandler(async (req, res) => {
  await citizenAuthService.logout({
    token: req.cookies?.[COOKIE_NAMES.CITIZEN_SESSION],
    citizenId: req.citizen?.id,
    req,
  });
  clearCitizenCookie(res);
  return sendSuccess(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    citizen: serializeCitizenIdentity(req.citizen),
    session: {
      idleTimeoutSeconds: config.session.citizenIdleSeconds,
      idleWarningSeconds: config.session.citizenIdleWarningSeconds,
      expiresInSeconds: req.citizenSession.expiresInSeconds,
      absoluteExpiresAt: req.citizenSession.absoluteExpiresAt,
    },
  });
});
