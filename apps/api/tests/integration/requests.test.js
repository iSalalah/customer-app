import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { createClient, signInCitizen, signInStaff } from '../setup/app.js';
import { TEST_PASSWORD, createCitizen, createRequest, seedOrganisation } from '../setup/factories.js';

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'ascii'),
  Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n', 'ascii'),
]);

describeIntegration('request creation, routing and workflow', () => {
  let prisma;
  let org;

  beforeAll(() => {
    prisma = getTestPrisma();
  });

  beforeEach(async () => {
    await resetAll();
    org = await seedOrganisation();
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  async function submit(client, { serviceId, idempotencyKey, extra = {}, files = [] }) {
    return client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': idempotencyKey },
      form: {
        fields: {
          serviceId,
          title: 'Broken street light on Al Nahda street',
          description: 'The street light outside building 42 has been out for a week and the road is dark.',
          ...extra,
        },
        files,
      },
    });
  }

  describe('creation', () => {
    it('creates a request with a well-formed reference number', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'key-001' });

      expect(response.status).toBe(201);
      expect(response.body.data.referenceNumber).toMatch(/^DHO-\d{4}-[0-9A-HJ-NP-TV-Z]{6}$/);
      expect(response.body.data.status).toBe('PENDING');
      expect(response.body.data.trackingUrl).toContain(response.body.data.referenceNumber);
    });

    it('derives the department and section from the service, not the client', async () => {
      const { client } = await signInCitizen('91234567');
      // The body deliberately tries to send its own routing.
      const response = await submit(client, {
        serviceId: org.serviceA1.id,
        idempotencyKey: 'key-002',
        extra: { departmentId: org.departmentB.id, sectionId: org.sectionB1.id },
      });

      // `.strict()` rejects the unexpected fields outright.
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('routes to the service\'s own department and section', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'key-003' });

      const created = await prisma.request.findUnique({
        where: { referenceNumber: response.body.data.referenceNumber },
      });

      expect(created.departmentId).toBe(org.departmentA.id);
      expect(created.sectionId).toBe(org.sectionA1.id);
    });

    it('leaves sectionId null for a department-level service', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: org.serviceADept.id, idempotencyKey: 'key-004' });

      const created = await prisma.request.findUnique({
        where: { referenceNumber: response.body.data.referenceNumber },
      });

      expect(created.departmentId).toBe(org.departmentA.id);
      expect(created.sectionId).toBeNull();
    });

    it('refuses an inactive service', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: org.serviceInactive.id, idempotencyKey: 'key-005' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('SERVICE_INACTIVE');
      expect(await prisma.request.count()).toBe(0);
    });

    it('writes CREATED and AUTO_ROUTED logs in the same transaction', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'key-006' });

      const created = await prisma.request.findUnique({
        where: { referenceNumber: response.body.data.referenceNumber },
        include: { logs: true },
      });

      const actions = created.logs.map((log) => log.action);
      expect(actions).toContain('CREATED');
      expect(actions).toContain('AUTO_ROUTED');

      const routed = created.logs.find((log) => log.action === 'AUTO_ROUTED');
      expect(routed.visibility).toBe('INTERNAL');
      expect(routed.metadata).toMatchObject({ departmentId: org.departmentA.id });
    });

    it('requires an Idempotency-Key header', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await client.post('/api/v1/citizen/requests', {
        form: {
          fields: {
            serviceId: org.serviceA1.id,
            title: 'A title that is long enough',
            description: 'A description that is comfortably longer than twenty characters.',
          },
        },
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('rejects a title or description that is too short', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await client.post('/api/v1/citizen/requests', {
        headers: { 'Idempotency-Key': 'key-007' },
        form: { fields: { serviceId: org.serviceA1.id, title: 'x', description: 'short' } },
      });

      expect(response.status).toBe(400);
      const paths = response.body.error.details.map((detail) => detail.path);
      expect(paths).toEqual(expect.arrayContaining(['title', 'description']));
    });

    it('refuses an unauthenticated submission', async () => {
      const client = await createClient();
      const response = await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'key-008' });
      expect(response.status).toBe(401);
    });

    it('enforces a service that requires attachments', async () => {
      const strictService = await prisma.municipalService.update({
        where: { id: org.serviceA1.id },
        data: { attachmentsRequired: true, minAttachments: 1 },
      });

      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: strictService.id, idempotencyKey: 'key-009' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('ATTACHMENT_REQUIRED');
      expect(await prisma.request.count()).toBe(0);
    });

    it('stores an attachment supplied with the request', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, {
        serviceId: org.serviceA1.id,
        idempotencyKey: 'key-010',
        files: [{ buffer: PDF, filename: 'evidence.pdf', contentType: 'application/pdf' }],
      });

      expect(response.status).toBe(201);

      const created = await prisma.request.findUnique({
        where: { referenceNumber: response.body.data.referenceNumber },
        include: { attachments: true },
      });

      expect(created.attachments).toHaveLength(1);
      expect(created.attachments[0].mimeType).toBe('application/pdf');
      // The storage key is server-generated and unrelated to the uploaded name.
      expect(created.attachments[0].storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
      expect(created.attachments[0].storageKey).not.toContain('evidence');
    });
  });

  describe('citizen reads', () => {
    it('lists only the signing-in citizen\'s own requests', async () => {
      const other = await createCitizen({ phoneNumber: '+96899999999' });
      await createRequest({
        citizenId: other.id,
        serviceId: org.serviceA1.id,
        departmentId: org.departmentA.id,
        sectionId: org.sectionA1.id,
        title: 'Another citizen request',
      });

      const { client } = await signInCitizen('91234567');
      await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'key-011' });

      const response = await client.get('/api/v1/citizen/requests');
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].title).not.toBe('Another citizen request');
    });

    it('answers 404 when a citizen asks for a request that is not theirs', async () => {
      const other = await createCitizen({ phoneNumber: '+96899999999' });
      const foreign = await createRequest({
        citizenId: other.id,
        serviceId: org.serviceA1.id,
        departmentId: org.departmentA.id,
        sectionId: org.sectionA1.id,
      });

      const { client } = await signInCitizen('91234567');
      const response = await client.get(`/api/v1/citizen/requests/${foreign.referenceNumber}`);

      expect(response.status).toBe(404);
    });

    it('paginates and filters by status', async () => {
      const { client } = await signInCitizen('91234567');
      await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'p-1' });
      await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'p-2' });
      await submit(client, { serviceId: org.serviceADept.id, idempotencyKey: 'p-3' });

      const page = await client.get('/api/v1/citizen/requests?page=1&pageSize=2');
      expect(page.body.data.requests).toHaveLength(2);
      expect(page.body.meta.pagination).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });

      const approved = await client.get('/api/v1/citizen/requests?status=APPROVED');
      expect(approved.body.data.requests).toHaveLength(0);
    });
  });

  describe('status transitions', () => {
    let requestId;

    beforeEach(async () => {
      const { client } = await signInCitizen('91234567');
      const response = await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'status-key' });
      const created = await prisma.request.findUnique({
        where: { referenceNumber: response.body.data.referenceNumber },
      });
      requestId = created.id;
      await prisma.request.update({ where: { id: requestId }, data: { assignedTo: org.employeeA1.id } });
    });

    it('accepts a permitted transition and logs it in the same transaction', async () => {
      const staff = await signInStaff('emp.a1', TEST_PASSWORD);
      const response = await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'IN_PROGRESS', note: 'Work started', noteVisibility: 'CITIZEN_VISIBLE' },
      });

      expect(response.status).toBe(200);

      const updated = await prisma.request.findUnique({ where: { id: requestId }, include: { logs: true } });
      expect(updated.status).toBe('IN_PROGRESS');

      const statusLog = updated.logs.find((log) => log.action === 'STATUS_CHANGED');
      expect(statusLog.previousStatus).toBe('PENDING');
      expect(statusLog.newStatus).toBe('IN_PROGRESS');
    });

    it('refuses a transition the matrix forbids', async () => {
      const staff = await signInStaff('emp.a1', TEST_PASSWORD);
      await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'IN_PROGRESS', note: 'ok', noteVisibility: 'INTERNAL' },
      });

      const response = await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'PENDING' },
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('refuses any change once the request is terminal', async () => {
      const staff = await signInStaff('emp.a1', TEST_PASSWORD);
      await staff.patch(`/api/v1/staff/requests/${requestId}/status`, { body: { status: 'APPROVED' } });

      const response = await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'IN_PROGRESS' },
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('REQUEST_IS_TERMINAL');
    });

    it('requires a citizen-visible note when moving to NEED_INFO', async () => {
      const staff = await signInStaff('emp.a1', TEST_PASSWORD);

      const withoutNote = await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'NEED_INFO' },
      });
      expect(withoutNote.status).toBe(400);

      const internalOnly = await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'NEED_INFO', note: 'ask for the plan', noteVisibility: 'INTERNAL' },
      });
      expect(internalOnly.status).toBe(400);

      const correct = await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
        body: { status: 'NEED_INFO', note: 'Please attach the building plan.', noteVisibility: 'CITIZEN_VISIBLE' },
      });
      expect(correct.status).toBe(200);
    });

    it('exposes only the legal transitions on the detail endpoint', async () => {
      const staff = await signInStaff('emp.a1', TEST_PASSWORD);
      const response = await staff.get(`/api/v1/staff/requests/${requestId}`);

      expect(response.body.data.request.allowedTransitions).toEqual(
        expect.arrayContaining(['IN_PROGRESS', 'NEED_INFO', 'APPROVED', 'REJECTED']),
      );
      expect(response.body.data.request.allowedTransitions).not.toContain('PENDING');
    });
  });

  describe('citizen replies', () => {
    it('accepts a reply only while the status is NEED_INFO', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await submit(client, { serviceId: org.serviceA1.id, idempotencyKey: 'reply-key' });
      const reference = created.body.data.referenceNumber;
      const row = await prisma.request.findUnique({ where: { referenceNumber: reference } });
      await prisma.request.update({ where: { id: row.id }, data: { assignedTo: org.employeeA1.id } });

      const tooEarly = await client.post(`/api/v1/citizen/requests/${reference}/replies`, {
        form: { fields: { message: 'Here is the extra information.' } },
      });
      expect(tooEarly.status).toBe(409);
      expect(tooEarly.body.error.code).toBe('REPLY_NOT_ALLOWED');

      const staff = await signInStaff('emp.a1', TEST_PASSWORD);
      await staff.patch(`/api/v1/staff/requests/${row.id}/status`, {
        body: { status: 'NEED_INFO', note: 'Please attach the plan.', noteVisibility: 'CITIZEN_VISIBLE' },
      });

      const accepted = await client.post(`/api/v1/citizen/requests/${reference}/replies`, {
        form: { fields: { message: 'Here is the extra information.' } },
      });
      expect(accepted.status).toBe(201);

      const logs = await prisma.requestLog.findMany({ where: { requestId: row.id } });
      const reply = logs.find((log) => log.action === 'CITIZEN_REPLIED');
      expect(reply.visibility).toBe('CITIZEN_VISIBLE');
      expect(reply.citizenId).not.toBeNull();

      // The reply does not move the status on its own; staff decide that.
      const after = await prisma.request.findUnique({ where: { id: row.id } });
      expect(after.status).toBe('NEED_INFO');
    });
  });
});
