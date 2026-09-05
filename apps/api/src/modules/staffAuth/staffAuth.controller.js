import { COOKIE_NAMES } from '@dhofar/shared';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/respond.js';
import { serializeStaffIdentity } from '../../utils/serializers.js';
import { clearStaffCookies, setStaffCookies } from '../../auth/staffSession.js';
import * as staffAuthService from './staffAuth.service.js';

export const login = asyncHandler(async (req, res) => {
  const { tokens, staff, permissions } = await staffAuthService.login({
    username: req.body.username,
    password: req.body.password,
    req,
  });

  setStaffCookies(res, tokens);

  // Tokens are never in the body - they exist only as HttpOnly cookies.
  return sendSuccess(res, { staff: serializeStaffIdentity(staff), permissions });
});

export const refresh = asyncHandler(async (req, res) => {
  const tokens = await staffAuthService.refresh({
    refreshToken: req.cookies?.[COOKIE_NAMES.STAFF_REFRESH],
    req,
  });
  setStaffCookies(res, tokens);
  return sendSuccess(res, { refreshed: true });
});

export const logout = asyncHandler(async (req, res) => {
  await staffAuthService.logout({
    accessToken: req.cookies?.[COOKIE_NAMES.STAFF_ACCESS],
    refreshToken: req.cookies?.[COOKIE_NAMES.STAFF_REFRESH],
    staffId: req.staff?.id,
    everywhere: req.body?.everywhere === true,
    req,
  });
  clearStaffCookies(res);
  return sendSuccess(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  const { staff, permissions } = staffAuthService.describeSelf(req.staff);
  return sendSuccess(res, { staff: serializeStaffIdentity(staff), permissions });
});
