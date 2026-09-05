import { SCOPE, STAFF_ROLE, permissionsForRole, scopeForRole } from '@dhofar/shared';

import {
  analyticsScopeFor,
  assertCanAssign,
  assertCanUpdateStatus,
  assertCanViewRequest,
  assertCitizenMayReply,
  assertCitizenOwnsRequest,
  assertValidAssignee,
  isRequestInScope,
  scopeWhere,
} from '../../src/auth/policies.js';

/**
 * Authorisation policies in isolation.
 *
 * These are the functions that actually decide access, so they are tested
 * against the loaded-row shape rather than through HTTP: an error here is a
 * breach, not a broken screen.
 */

const DEPARTMENT_A = 'dept-a';
const DEPARTMENT_B = 'dept-b';
const SECTION_1 = 'sec-1';
const SECTION_2 = 'sec-2';

const scope = {
  manager: { staffId: 'mgr-a', role: STAFF_ROLE.MANAGER, scope: SCOPE.DEPARTMENT, departmentId: DEPARTMENT_A, sectionId: null },
  head: { staffId: 'head-1', role: STAFF_ROLE.SECTION_HEAD, scope: SCOPE.SECTION, departmentId: DEPARTMENT_A, sectionId: SECTION_1 },
  employee: { staffId: 'emp-1', role: STAFF_ROLE.EMPLOYEE, scope: SCOPE.OWN, departmentId: DEPARTMENT_A, sectionId: SECTION_1 },
};

const request = (overrides = {}) => ({
  id: 'req-1',
  status: 'PENDING',
  citizenId: 'cit-1',
  departmentId: DEPARTMENT_A,
  sectionId: SECTION_1,
  assignedTo: 'emp-1',
  ...overrides,
});

describe('role to scope mapping', () => {
  it('gives each role exactly the scope documented in docs/03-rbac.md', () => {
    expect(scopeForRole(STAFF_ROLE.MANAGER)).toBe(SCOPE.DEPARTMENT);
    expect(scopeForRole(STAFF_ROLE.SECTION_HEAD)).toBe(SCOPE.SECTION);
    expect(scopeForRole(STAFF_ROLE.EMPLOYEE)).toBe(SCOPE.OWN);
  });

  it('defaults an unknown role to the narrowest scope', () => {
    expect(scopeForRole('SUPERUSER')).toBe(SCOPE.OWN);
    expect(scopeForRole(undefined)).toBe(SCOPE.OWN);
  });

  it('only lets managers and section heads assign', () => {
    expect(permissionsForRole(STAFF_ROLE.MANAGER).canAssign).toBe(true);
    expect(permissionsForRole(STAFF_ROLE.SECTION_HEAD).canAssign).toBe(true);
    expect(permissionsForRole(STAFF_ROLE.EMPLOYEE).canAssign).toBe(false);
  });
});

describe('scopeWhere', () => {
  it('constrains a manager to their department', () => {
    expect(scopeWhere(scope.manager)).toEqual({ departmentId: DEPARTMENT_A });
  });

  it('constrains a section head to their department and section', () => {
    expect(scopeWhere(scope.head)).toEqual({ departmentId: DEPARTMENT_A, sectionId: SECTION_1 });
  });

  it('constrains an employee to their own assignments', () => {
    expect(scopeWhere(scope.employee)).toEqual({ assignedTo: 'emp-1' });
  });
});

describe('isRequestInScope', () => {
  it('lets a manager see anything in their department, section or not', () => {
    expect(isRequestInScope(request(), scope.manager)).toBe(true);
    expect(isRequestInScope(request({ sectionId: SECTION_2 }), scope.manager)).toBe(true);
    expect(isRequestInScope(request({ sectionId: null }), scope.manager)).toBe(true);
    expect(isRequestInScope(request({ assignedTo: null }), scope.manager)).toBe(true);
  });

  it('stops a manager at their department boundary', () => {
    expect(isRequestInScope(request({ departmentId: DEPARTMENT_B }), scope.manager)).toBe(false);
  });

  it('stops a section head at their section boundary', () => {
    expect(isRequestInScope(request(), scope.head)).toBe(true);
    expect(isRequestInScope(request({ sectionId: SECTION_2 }), scope.head)).toBe(false);
    expect(isRequestInScope(request({ sectionId: null }), scope.head)).toBe(false);
  });

  it('stops an employee at their own assignments', () => {
    expect(isRequestInScope(request(), scope.employee)).toBe(true);
    expect(isRequestInScope(request({ assignedTo: 'emp-2' }), scope.employee)).toBe(false);
    expect(isRequestInScope(request({ assignedTo: null }), scope.employee)).toBe(false);
  });
});

describe('assertCanViewRequest', () => {
  it('returns the row when it is in scope', () => {
    expect(assertCanViewRequest(request(), scope.manager)).toBeTruthy();
  });

  it('answers 404 rather than 403, so an id is not confirmed to an outsider', () => {
    expect(() => assertCanViewRequest(request({ departmentId: DEPARTMENT_B }), scope.manager)).toThrow(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' }),
    );
  });

  it('treats a missing row identically to an out-of-scope one', () => {
    expect(() => assertCanViewRequest(null, scope.manager)).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });
});

describe('assertCanUpdateStatus', () => {
  it('permits a transition the matrix allows', () => {
    expect(assertCanUpdateStatus(request(), scope.employee, 'IN_PROGRESS')).toBeTruthy();
  });

  it('refuses a transition the matrix forbids', () => {
    expect(() => assertCanUpdateStatus(request({ status: 'NEED_INFO' }), scope.employee, 'PENDING')).toThrow(
      expect.objectContaining({ status: 409, code: 'INVALID_STATUS_TRANSITION' }),
    );
  });

  it('refuses any change to a terminal request', () => {
    for (const terminal of ['APPROVED', 'REJECTED']) {
      expect(() => assertCanUpdateStatus(request({ status: terminal }), scope.manager, 'IN_PROGRESS')).toThrow(
        expect.objectContaining({ status: 409, code: 'REQUEST_IS_TERMINAL' }),
      );
    }
  });

  it('checks scope before the transition', () => {
    expect(() =>
      assertCanUpdateStatus(request({ assignedTo: 'someone-else' }), scope.employee, 'IN_PROGRESS'),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('assertCanAssign', () => {
  it('refuses an employee outright', () => {
    expect(() => assertCanAssign(request(), scope.employee)).toThrow(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });

  it('allows a manager and a section head within scope', () => {
    expect(assertCanAssign(request(), scope.manager)).toBeTruthy();
    expect(assertCanAssign(request(), scope.head)).toBeTruthy();
  });

  it('refuses assignment on a closed request', () => {
    expect(() => assertCanAssign(request({ status: 'APPROVED' }), scope.manager)).toThrow(
      expect.objectContaining({ code: 'REQUEST_IS_TERMINAL' }),
    );
  });
});

describe('assertValidAssignee', () => {
  const assignee = (overrides = {}) => ({
    id: 'emp-1',
    isActive: true,
    departmentId: DEPARTMENT_A,
    sectionId: SECTION_1,
    ...overrides,
  });

  it('accepts an active member of the same department and section', () => {
    expect(assertValidAssignee(request(), assignee(), scope.manager)).toBeTruthy();
  });

  it('refuses a disabled member', () => {
    expect(() => assertValidAssignee(request(), assignee({ isActive: false }), scope.manager)).toThrow(
      expect.objectContaining({ status: 422, code: 'INVALID_ASSIGNEE' }),
    );
  });

  it('refuses a member of another department', () => {
    expect(() =>
      assertValidAssignee(request(), assignee({ departmentId: DEPARTMENT_B }), scope.manager),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ASSIGNEE' }));
  });

  it('refuses a member of another section when the request has one', () => {
    expect(() => assertValidAssignee(request(), assignee({ sectionId: SECTION_2 }), scope.manager)).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNEE' }),
    );
  });

  it('allows any section when the request is department-level', () => {
    const departmentLevel = request({ sectionId: null });
    expect(assertValidAssignee(departmentLevel, assignee({ sectionId: SECTION_2 }), scope.manager)).toBeTruthy();
  });

  it('stops a section head assigning outside their own section', () => {
    const departmentLevel = request({ sectionId: null });
    expect(() => assertValidAssignee(departmentLevel, assignee({ sectionId: SECTION_2 }), scope.head)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('refuses a null assignee record', () => {
    expect(() => assertValidAssignee(request(), null, scope.manager)).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNEE' }),
    );
  });
});

describe('citizen policies', () => {
  it('accepts the owner and refuses everyone else with 404', () => {
    expect(assertCitizenOwnsRequest(request(), 'cit-1')).toBeTruthy();
    expect(() => assertCitizenOwnsRequest(request(), 'cit-2')).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(() => assertCitizenOwnsRequest(null, 'cit-1')).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('permits a reply only while the request awaits information', () => {
    expect(assertCitizenMayReply(request({ status: 'NEED_INFO' }))).toBeTruthy();
    for (const status of ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED']) {
      expect(() => assertCitizenMayReply(request({ status }))).toThrow(
        expect.objectContaining({ status: 409, code: 'REPLY_NOT_ALLOWED' }),
      );
    }
  });
});

describe('analytics scope', () => {
  it('derives the filter from the caller, never from a parameter', () => {
    expect(analyticsScopeFor(scope.manager)).toEqual({
      level: 'DEPARTMENT',
      where: { departmentId: DEPARTMENT_A },
    });
    expect(analyticsScopeFor(scope.head)).toEqual({
      level: 'SECTION',
      where: { departmentId: DEPARTMENT_A, sectionId: SECTION_1 },
    });
    expect(analyticsScopeFor(scope.employee)).toEqual({ level: 'OWN', where: { assignedTo: 'emp-1' } });
  });
});
