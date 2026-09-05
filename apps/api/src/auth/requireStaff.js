import { COOKIE_NAMES, ERROR_CODE, STAFF_ROLE, scopeForRole } from '@dhofar/shared';

import prisma from '../infra/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { clearStaffCookies, resolveStaffAccessToken, revokeAllStaffSessions } from './staffSession.js';

/**
 * Staff authentication and coarse role gate.
 *
 * `requireStaff()` authenticates and builds `req.staffScope`; passing roles adds
 * the route-level check. This is the FIRST of the two authorisation layers -
 * services still re-derive the decision from the loaded row
 * (see auth/policies.js and docs/02-architecture.md).
 */
export function requireStaff(...allowedRoles) {
  return async function requireStaffMiddleware(req, res, next) {
    try {
      const token = req.cookies?.[COOKIE_NAMES.STAFF_ACCESS];
      const claim = await resolveStaffAccessToken(token);

      if (!claim) {
        clearStaffCookies(res);
        throw ApiError.unauthenticated(ERROR_CODE.UNAUTHENTICATED, 'Please sign in to continue.');
      }

      const staff = await prisma.staff.findUnique({
        where: { id: claim.staffId },
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          username: true,
          role: true,
          departmentId: true,
          sectionId: true,
          isActive: true,
          lastLoginAt: true,
          department: { select: { id: true, nameAr: true, nameEn: true } },
          section: { select: { id: true, nameAr: true, nameEn: true } },
        },
      });

      if (!staff) {
        clearStaffCookies(res);
        throw ApiError.unauthenticated(ERROR_CODE.UNAUTHENTICATED, 'Please sign in to continue.');
      }

      // A member disabled mid-session loses access on their very next request.
      if (!staff.isActive) {
        await revokeAllStaffSessions(staff.id);
        clearStaffCookies(res);
        throw ApiError.forbidden(ERROR_CODE.ACCOUNT_DISABLED, 'This account has been disabled.');
      }

      // A section-scoped role without a section has no computable scope. Denying
      // is the only safe reading of a misconfigured row.
      if (
        (staff.role === STAFF_ROLE.SECTION_HEAD || staff.role === STAFF_ROLE.EMPLOYEE) &&
        !staff.sectionId
      ) {
        throw ApiError.forbidden(ERROR_CODE.FORBIDDEN, 'This account is not assigned to a section.', {
          logContext: { staffId: staff.id, role: staff.role },
        });
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(staff.role)) {
        throw ApiError.forbidden(ERROR_CODE.FORBIDDEN, 'Your role does not permit this action.', {
          logContext: { staffId: staff.id, role: staff.role, allowedRoles },
        });
      }

      req.staff = staff;
      req.staffScope = Object.freeze({
        staffId: staff.id,
        role: staff.role,
        scope: scopeForRole(staff.role),
        departmentId: staff.departmentId,
        sectionId: staff.sectionId,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

export default requireStaff;
