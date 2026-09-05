import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { signInStaff } from '../setup/app.js';
import { TEST_PASSWORD, createCitizen, createRequest, seedOrganisation } from '../setup/factories.js';

/**
 * The role-based access control matrix from docs/03-rbac.md, exercised over
 * HTTP against a real database. Each case is a scope boundary that must hold.
 */
describeIntegration('RBAC and organisational scope', () => {
  let prisma;
  let org;
  let citizen;
  let requestInA1; // department A, section A1, assigned to employeeA1
  let requestInA2; // department A, section A2, assigned to employeeA2
  let requestInB1; // department B - out of reach for every department A account
  let unassignedInA1;

  beforeAll(() => {
    prisma = getTestPrisma();
  });

  beforeEach(async () => {
    await resetAll();
    org = await seedOrganisation();
    citizen = await createCitizen({ phoneNumber: '+96891000001' });

    requestInA1 = await createRequest({
      citizenId: citizen.id,
      serviceId: org.serviceA1.id,
      departmentId: org.departmentA.id,
      sectionId: org.sectionA1.id,
      assignedTo: org.employeeA1.id,
      title: 'Request in section A1',
    });

    requestInA2 = await createRequest({
      citizenId: citizen.id,
      serviceId: org.serviceA1.id,
      departmentId: org.departmentA.id,
      sectionId: org.sectionA2.id,
      assignedTo: org.employeeA2.id,
      title: 'Request in section A2',
    });

    requestInB1 = await createRequest({
      citizenId: citizen.id,
      serviceId: org.serviceA1.id,
      departmentId: org.departmentB.id,
      sectionId: org.sectionB1.id,
      assignedTo: org.employeeB1.id,
      title: 'Request in department B',
    });

    unassignedInA1 = await createRequest({
      citizenId: citizen.id,
      serviceId: org.serviceA1.id,
      departmentId: org.departmentA.id,
      sectionId: org.sectionA1.id,
      assignedTo: null,
      title: 'Unassigned in A1',
    });
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  describe('listing', () => {
    it('shows a manager every request in their department and nothing outside it', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.get('/api/v1/staff/requests?pageSize=100');

      const ids = response.body.data.requests.map((request) => request.id);
      expect(ids).toEqual(expect.arrayContaining([requestInA1.id, requestInA2.id, unassignedInA1.id]));
      expect(ids).not.toContain(requestInB1.id);
    });

    it('shows a section head only their own section', async () => {
      const client = await signInStaff('head.a1', TEST_PASSWORD);
      const response = await client.get('/api/v1/staff/requests?pageSize=100');

      const ids = response.body.data.requests.map((request) => request.id);
      expect(ids).toEqual(expect.arrayContaining([requestInA1.id, unassignedInA1.id]));
      expect(ids).not.toContain(requestInA2.id);
      expect(ids).not.toContain(requestInB1.id);
    });

    it('shows an employee only requests assigned to them', async () => {
      const client = await signInStaff('emp.a1', TEST_PASSWORD);
      const response = await client.get('/api/v1/staff/requests?pageSize=100');

      const ids = response.body.data.requests.map((request) => request.id);
      expect(ids).toEqual([requestInA1.id]);
      // An unassigned request in their own section is still not theirs.
      expect(ids).not.toContain(unassignedInA1.id);
    });

    it('lets a filter narrow the scope', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.get(
        `/api/v1/staff/requests?sectionId=${org.sectionA2.id}&pageSize=100`,
      );

      const ids = response.body.data.requests.map((request) => request.id);
      expect(ids).toEqual([requestInA2.id]);
    });

    it('does not let a filter widen the scope', async () => {
      // A section head asking for another section gets nothing, not that section.
      const head = await signInStaff('head.a1', TEST_PASSWORD);
      const otherSection = await head.get(`/api/v1/staff/requests?sectionId=${org.sectionA2.id}`);
      expect(otherSection.body.data.requests).toHaveLength(0);

      // A manager asking for another department gets nothing.
      const manager = await signInStaff('manager.a', TEST_PASSWORD);
      const otherDepartment = await manager.get(
        `/api/v1/staff/requests?departmentId=${org.departmentB.id}`,
      );
      expect(otherDepartment.body.data.requests).toHaveLength(0);

      // An employee asking for a colleague's queue gets nothing.
      const employee = await signInStaff('emp.a1', TEST_PASSWORD);
      const otherAssignee = await employee.get(
        `/api/v1/staff/requests?assignedTo=${org.employeeA2.id}`,
      );
      expect(otherAssignee.body.data.requests).toHaveLength(0);
    });
  });

  describe('reading a single request', () => {
    it('answers 404 across a department boundary, so the id is not confirmed', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.get(`/api/v1/staff/requests/${requestInB1.id}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('answers 404 across a section boundary', async () => {
      const client = await signInStaff('head.a1', TEST_PASSWORD);
      expect((await client.get(`/api/v1/staff/requests/${requestInA2.id}`)).status).toBe(404);
    });

    it('answers 404 for an employee reading a colleague\'s request', async () => {
      const client = await signInStaff('emp.a1', TEST_PASSWORD);
      expect((await client.get(`/api/v1/staff/requests/${requestInA2.id}`)).status).toBe(404);
      expect((await client.get(`/api/v1/staff/requests/${requestInA1.id}`)).status).toBe(200);
    });
  });

  describe('assignment', () => {
    it('refuses an employee at the route layer', async () => {
      const client = await signInStaff('emp.a1', TEST_PASSWORD);
      const response = await client.patch(`/api/v1/staff/requests/${requestInA1.id}/assignment`, {
        body: { assignedTo: org.employeeA1b.id },
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('lets a section head reassign inside their section', async () => {
      const client = await signInStaff('head.a1', TEST_PASSWORD);
      const response = await client.patch(`/api/v1/staff/requests/${requestInA1.id}/assignment`, {
        body: { assignedTo: org.employeeA1b.id },
      });

      expect(response.status).toBe(200);
      const updated = await prisma.request.findUnique({ where: { id: requestInA1.id } });
      expect(updated.assignedTo).toBe(org.employeeA1b.id);
    });

    it('refuses a section head assigning to another section', async () => {
      const client = await signInStaff('head.a1', TEST_PASSWORD);
      const response = await client.patch(`/api/v1/staff/requests/${requestInA1.id}/assignment`, {
        body: { assignedTo: org.employeeA2.id },
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('refuses a manager assigning across departments', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.patch(`/api/v1/staff/requests/${requestInA1.id}/assignment`, {
        body: { assignedTo: org.employeeB1.id },
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('refuses assigning to a disabled staff member', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.patch(`/api/v1/staff/requests/${requestInA1.id}/assignment`, {
        body: { assignedTo: org.disabledEmployee.id },
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('records an ASSIGNED log the first time and REASSIGNED afterwards', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);

      await client.patch(`/api/v1/staff/requests/${unassignedInA1.id}/assignment`, {
        body: { assignedTo: org.employeeA1.id },
      });
      await client.patch(`/api/v1/staff/requests/${unassignedInA1.id}/assignment`, {
        body: { assignedTo: org.employeeA1b.id },
      });

      const logs = await prisma.requestLog.findMany({
        where: { requestId: unassignedInA1.id },
        orderBy: { createdAt: 'asc' },
      });
      const actions = logs.map((log) => log.action);

      expect(actions).toContain('ASSIGNED');
      expect(actions).toContain('REASSIGNED');
      // Assignment history is internal, never shown to the citizen.
      expect(logs.every((log) => log.visibility === 'INTERNAL')).toBe(true);
    });

    it('allows unassigning by passing null', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.patch(`/api/v1/staff/requests/${requestInA1.id}/assignment`, {
        body: { assignedTo: null },
      });

      expect(response.status).toBe(200);
      const updated = await prisma.request.findUnique({ where: { id: requestInA1.id } });
      expect(updated.assignedTo).toBeNull();
    });
  });

  describe('analytics', () => {
    it('scopes the summary to the caller and offers no way to widen it', async () => {
      const manager = await signInStaff('manager.a', TEST_PASSWORD);
      const managerSummary = await manager.get('/api/v1/staff/analytics/summary');
      expect(managerSummary.body.data.summary.scope).toBe('DEPARTMENT');
      expect(managerSummary.body.data.summary.totals.total).toBe(3);

      const head = await signInStaff('head.a1', TEST_PASSWORD);
      const headSummary = await head.get('/api/v1/staff/analytics/summary');
      expect(headSummary.body.data.summary.scope).toBe('SECTION');
      expect(headSummary.body.data.summary.totals.total).toBe(2);

      const employee = await signInStaff('emp.a1', TEST_PASSWORD);
      const employeeSummary = await employee.get('/api/v1/staff/analytics/summary');
      expect(employeeSummary.body.data.summary.scope).toBe('OWN');
      expect(employeeSummary.body.data.summary.totals.total).toBe(1);
    });

    it('ignores any scope-shaped query parameter', async () => {
      const employee = await signInStaff('emp.a1', TEST_PASSWORD);
      const response = await employee.get(
        `/api/v1/staff/analytics/summary?departmentId=${org.departmentA.id}&scope=DEPARTMENT`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.summary.scope).toBe('OWN');
      expect(response.body.data.summary.totals.total).toBe(1);
    });
  });

  describe('citizens cannot reach staff endpoints', () => {
    it('refuses an unauthenticated caller', async () => {
      const { createClient } = await import('../setup/app.js');
      const client = await createClient();
      const response = await client.get('/api/v1/staff/requests');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});
