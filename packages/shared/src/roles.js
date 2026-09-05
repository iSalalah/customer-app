/** Staff roles and the scope each role resolves to. Mirrors docs/03-rbac.md. */

export const STAFF_ROLE = Object.freeze({
  MANAGER: 'MANAGER',
  SECTION_HEAD: 'SECTION_HEAD',
  EMPLOYEE: 'EMPLOYEE',
});

export const STAFF_ROLES = Object.freeze(Object.values(STAFF_ROLE));

export const SCOPE = Object.freeze({
  DEPARTMENT: 'DEPARTMENT',
  SECTION: 'SECTION',
  OWN: 'OWN',
});

const ROLE_SCOPE = Object.freeze({
  [STAFF_ROLE.MANAGER]: SCOPE.DEPARTMENT,
  [STAFF_ROLE.SECTION_HEAD]: SCOPE.SECTION,
  [STAFF_ROLE.EMPLOYEE]: SCOPE.OWN,
});

export function scopeForRole(role) {
  return ROLE_SCOPE[role] ?? SCOPE.OWN;
}

/** Roles permitted to change a request's assignee. Employees never can. */
export const ROLES_THAT_MAY_ASSIGN = Object.freeze([STAFF_ROLE.MANAGER, STAFF_ROLE.SECTION_HEAD]);

export function canAssignRequests(role) {
  return ROLES_THAT_MAY_ASSIGN.includes(role);
}

/**
 * Capability flags returned by GET /auth/staff/me. The admin SPA uses these to
 * decide which controls to draw. They are a convenience, never an authorisation
 * decision - the API re-derives every one of them server-side.
 */
export function permissionsForRole(role) {
  const scope = scopeForRole(role);
  return Object.freeze({
    scope,
    canAssign: canAssignRequests(role),
    canUpdateStatus: true,
    canAddInternalNote: true,
    canReplyToCitizen: true,
    canViewDepartmentAnalytics: role === STAFF_ROLE.MANAGER,
    canViewSectionAnalytics: role === STAFF_ROLE.MANAGER || role === STAFF_ROLE.SECTION_HEAD,
  });
}
