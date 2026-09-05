import {
  ERROR_CODE,
  SCOPE,
  STAFF_ROLE,
  canAssignRequests,
  canTransition,
  isTerminalStatus,
} from '@dhofar/shared';

import { ApiError } from '../utils/ApiError.js';

/**
 * Authorisation policies.
 *
 * These are the real access controls. Every one of them decides from the LOADED
 * ROW - never from a query parameter, a request body, or anything the client
 * could influence. Route guards (auth/requireStaff.js) are the coarse first
 * layer; this file is the one that must be right.
 */

/** Prisma `where` fragment that constrains any listing to the caller's scope. */
export function scopeWhere(staffScope) {
  switch (staffScope.scope) {
    case SCOPE.DEPARTMENT:
      return { departmentId: staffScope.departmentId };
    case SCOPE.SECTION:
      return { departmentId: staffScope.departmentId, sectionId: staffScope.sectionId };
    case SCOPE.OWN:
    default:
      return { assignedTo: staffScope.staffId };
  }
}

/** True when the request row lies inside the caller's scope. */
export function isRequestInScope(request, staffScope) {
  switch (staffScope.scope) {
    case SCOPE.DEPARTMENT:
      return request.departmentId === staffScope.departmentId;
    case SCOPE.SECTION:
      return (
        request.departmentId === staffScope.departmentId && request.sectionId === staffScope.sectionId
      );
    case SCOPE.OWN:
    default:
      return request.assignedTo === staffScope.staffId;
  }
}

/**
 * Out-of-scope reads answer 404, not 403: confirming that an id exists is itself
 * information, and a manager in another department should not be able to probe
 * for valid request ids.
 */
export function assertCanViewRequest(request, staffScope) {
  if (!request || !isRequestInScope(request, staffScope)) {
    throw ApiError.notFound('The requested resource was not found.', {
      logContext: { staffId: staffScope.staffId, requestId: request?.id, scope: staffScope.scope },
    });
  }
  return request;
}

export function assertCanUpdateStatus(request, staffScope, nextStatus) {
  assertCanViewRequest(request, staffScope);

  if (isTerminalStatus(request.status)) {
    throw ApiError.conflict(
      ERROR_CODE.REQUEST_IS_TERMINAL,
      'This request is closed and can no longer be changed.',
    );
  }

  if (!canTransition(request.status, nextStatus)) {
    throw ApiError.conflict(
      ERROR_CODE.INVALID_STATUS_TRANSITION,
      'This status change is not permitted from the current status.',
      { meta: { from: request.status, to: nextStatus } },
    );
  }

  return request;
}

export function assertCanAssign(request, staffScope) {
  assertCanViewRequest(request, staffScope);

  if (!canAssignRequests(staffScope.role)) {
    throw ApiError.forbidden(ERROR_CODE.FORBIDDEN, 'Your role does not permit assigning requests.');
  }

  if (isTerminalStatus(request.status)) {
    throw ApiError.conflict(
      ERROR_CODE.REQUEST_IS_TERMINAL,
      'This request is closed and can no longer be changed.',
    );
  }

  return request;
}

/**
 * The cross-table invariant Prisma cannot express (docs/05-database.md).
 *
 * An assignee must be:
 *   1. active,
 *   2. in the request's department,
 *   3. in the request's section when the request has one,
 *   4. within the assigner's own section when the assigner is a section head.
 */
export function assertValidAssignee(request, assignee, staffScope) {
  if (!assignee || !assignee.isActive) {
    throw ApiError.unprocessable(
      ERROR_CODE.INVALID_ASSIGNEE,
      'The selected staff member cannot receive assignments.',
    );
  }

  if (assignee.departmentId !== request.departmentId) {
    throw ApiError.unprocessable(
      ERROR_CODE.INVALID_ASSIGNEE,
      'A request can only be assigned within its own department.',
      { logContext: { requestDepartment: request.departmentId, assigneeDepartment: assignee.departmentId } },
    );
  }

  if (request.sectionId && assignee.sectionId !== request.sectionId) {
    throw ApiError.unprocessable(
      ERROR_CODE.INVALID_ASSIGNEE,
      'A request can only be assigned within its own section.',
      { logContext: { requestSection: request.sectionId, assigneeSection: assignee.sectionId } },
    );
  }

  if (staffScope.role === STAFF_ROLE.SECTION_HEAD && assignee.sectionId !== staffScope.sectionId) {
    throw ApiError.forbidden(
      ERROR_CODE.FORBIDDEN,
      'A section head may only assign to staff within their own section.',
    );
  }

  return assignee;
}

export function assertCitizenOwnsRequest(request, citizenId) {
  if (!request || request.citizenId !== citizenId) {
    throw ApiError.notFound('The requested resource was not found.');
  }
  return request;
}

/** A citizen may only add information while the request is waiting for it. */
export function assertCitizenMayReply(request) {
  if (request.status !== 'NEED_INFO') {
    throw ApiError.conflict(
      ERROR_CODE.REPLY_NOT_ALLOWED,
      'Additional information can only be added while the request is awaiting it.',
    );
  }
  return request;
}

/** Analytics scope is derived from the caller, never from a parameter. */
export function analyticsScopeFor(staffScope) {
  switch (staffScope.scope) {
    case SCOPE.DEPARTMENT:
      return { level: 'DEPARTMENT', where: { departmentId: staffScope.departmentId } };
    case SCOPE.SECTION:
      return {
        level: 'SECTION',
        where: { departmentId: staffScope.departmentId, sectionId: staffScope.sectionId },
      };
    case SCOPE.OWN:
    default:
      return { level: 'OWN', where: { assignedTo: staffScope.staffId } };
  }
}
