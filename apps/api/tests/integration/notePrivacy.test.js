import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { signInCitizen, signInStaff } from '../setup/app.js';
import { TEST_PASSWORD, seedOrganisation } from '../setup/factories.js';

const SECRET = 'INTERNAL ONLY: the applicant has an outstanding fine of OMR 250.';
const PUBLIC_MESSAGE = 'Please attach the ownership document.';

/**
 * The single most damaging failure this system could have is an internal note
 * reaching the citizen it is about. These tests assert that from both ends: the
 * query that fetches the timeline, and the serialiser that renders it.
 */
describeIntegration('internal note privacy', () => {
  let prisma;
  let org;
  let citizenClient;
  let reference;
  let requestId;

  beforeAll(() => {
    prisma = getTestPrisma();
  });

  beforeEach(async () => {
    await resetAll();
    org = await seedOrganisation();

    const session = await signInCitizen('91234567');
    citizenClient = session.client;

    const created = await citizenClient.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'privacy-key' },
      form: {
        fields: {
          serviceId: org.serviceA1.id,
          title: 'Building permit for a residential villa',
          description: 'Requesting a permit to build a two-storey villa on plot 145.',
        },
      },
    });

    reference = created.body.data.referenceNumber;
    const row = await prisma.request.findUnique({ where: { referenceNumber: reference } });
    requestId = row.id;
    await prisma.request.update({ where: { id: requestId }, data: { assignedTo: org.employeeA1.id } });
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  it('keeps an internal note out of the citizen timeline', async () => {
    const staff = await signInStaff('emp.a1', TEST_PASSWORD);
    await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: SECRET, visibility: 'INTERNAL' },
    });

    const detail = await citizenClient.get(`/api/v1/citizen/requests/${reference}`);
    const serialised = JSON.stringify(detail.body);

    expect(detail.status).toBe(200);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain('INTERNAL');
    expect(detail.body.data.request.timeline.every((entry) => entry.message !== SECRET)).toBe(true);
  });

  it('does show a citizen-visible note', async () => {
    const staff = await signInStaff('emp.a1', TEST_PASSWORD);
    await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: PUBLIC_MESSAGE, visibility: 'CITIZEN_VISIBLE' },
    });

    const detail = await citizenClient.get(`/api/v1/citizen/requests/${reference}`);
    const messages = detail.body.data.request.timeline.map((entry) => entry.message);

    expect(messages).toContain(PUBLIC_MESSAGE);
  });

  it('separates the two even when both exist on the same request', async () => {
    const staff = await signInStaff('emp.a1', TEST_PASSWORD);
    await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: SECRET, visibility: 'INTERNAL' },
    });
    await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: PUBLIC_MESSAGE, visibility: 'CITIZEN_VISIBLE' },
    });

    const detail = await citizenClient.get(`/api/v1/citizen/requests/${reference}`);
    const messages = detail.body.data.request.timeline.map((entry) => entry.message);

    expect(messages).toContain(PUBLIC_MESSAGE);
    expect(messages).not.toContain(SECRET);
  });

  it('never reveals staff identity to a citizen', async () => {
    const staff = await signInStaff('emp.a1', TEST_PASSWORD);
    await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: PUBLIC_MESSAGE, visibility: 'CITIZEN_VISIBLE' },
    });
    await staff.patch(`/api/v1/staff/requests/${requestId}/status`, {
      body: { status: 'IN_PROGRESS', note: 'Started the review.', noteVisibility: 'CITIZEN_VISIBLE' },
    });

    const detail = await citizenClient.get(`/api/v1/citizen/requests/${reference}`);
    const serialised = JSON.stringify(detail.body);

    // No name, no username, no id of any staff member.
    expect(serialised).not.toContain(org.employeeA1.nameAr);
    expect(serialised).not.toContain(org.employeeA1.nameEn);
    expect(serialised).not.toContain('emp.a1');
    expect(serialised).not.toContain(org.employeeA1.id);
    expect(serialised).not.toContain('assignedTo');
    expect(serialised).not.toContain('assignee');
  });

  it('never reveals the internal routing or the assignment history', async () => {
    const manager = await signInStaff('manager.a', TEST_PASSWORD);
    await manager.patch(`/api/v1/staff/requests/${requestId}/assignment`, {
      body: { assignedTo: org.employeeA1b.id },
    });

    const detail = await citizenClient.get(`/api/v1/citizen/requests/${reference}`);
    const serialised = JSON.stringify(detail.body);

    expect(serialised).not.toContain(org.sectionA1.id);
    expect(serialised).not.toContain('sectionId');
    expect(serialised).not.toContain('idempotencyKey');
    expect(detail.body.data.request.timeline.some((entry) => entry.action === 'ASSIGNED')).toBe(false);
    expect(detail.body.data.request.timeline.some((entry) => entry.action === 'AUTO_ROUTED')).toBe(false);
  });

  it('shows staff the full timeline including internal entries', async () => {
    const staff = await signInStaff('emp.a1', TEST_PASSWORD);
    await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: SECRET, visibility: 'INTERNAL' },
    });

    const detail = await staff.get(`/api/v1/staff/requests/${requestId}`);
    const messages = detail.body.data.request.timeline.map((entry) => entry.message);

    expect(messages).toContain(SECRET);
    expect(detail.body.data.request.timeline.some((entry) => entry.visibility === 'INTERNAL')).toBe(true);
  });

  it('never leaks a citizen\'s full phone number to staff', async () => {
    const staff = await signInStaff('manager.a', TEST_PASSWORD);
    const detail = await staff.get(`/api/v1/staff/requests/${requestId}`);

    expect(detail.body.data.request.citizen.phoneMasked).toContain('*');
    expect(JSON.stringify(detail.body)).not.toContain('+96891234567');
  });

  it('keeps the log append-only: there is no route that edits or deletes one', async () => {
    const staff = await signInStaff('emp.a1', TEST_PASSWORD);
    const created = await staff.post(`/api/v1/staff/requests/${requestId}/notes`, {
      body: { message: SECRET, visibility: 'INTERNAL' },
    });

    const logId = created.body.data.id;

    expect((await staff.patch(`/api/v1/staff/requests/${requestId}/logs/${logId}`, { body: {} })).status).toBe(
      404,
    );
    expect((await staff.delete(`/api/v1/staff/requests/${requestId}/logs/${logId}`)).status).toBe(404);

    expect(await prisma.requestLog.count({ where: { id: logId } })).toBe(1);
  });
});
