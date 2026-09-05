import { closeTestConnections, describeIntegration, getTestPrisma, resetAll, resetRedis } from '../setup/db.js';
import { createClient, signInCitizen } from '../setup/app.js';
import { createCitizen, createRequest, seedOrganisation } from '../setup/factories.js';

/**
 * Public tracking is the only endpoint an anonymous internet caller can reach
 * with a guessable identifier, so its response shape is a security control in
 * its own right.
 */
describeIntegration('public request tracking', () => {
  let prisma;
  let org;
  let citizen;
  let request;

  beforeAll(() => {
    prisma = getTestPrisma();
  });

  beforeEach(async () => {
    await resetAll();
    org = await seedOrganisation();
    citizen = await createCitizen({ phoneNumber: '+96891234567', fullName: 'Ahmed Al Balushi' });
    request = await createRequest({
      citizenId: citizen.id,
      serviceId: org.serviceA1.id,
      departmentId: org.departmentA.id,
      sectionId: org.sectionA1.id,
      assignedTo: org.employeeA1.id,
      referenceNumber: 'DHO-2026-A7K2M9',
      title: 'Building permit for a residential villa',
      description: 'A description that should never appear in a public tracking response.',
    });
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  it('returns exactly four fields and nothing else', async () => {
    const client = await createClient();
    const response = await client.get('/api/v1/public/requests/DHO-2026-A7K2M9/status');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data.tracking).sort()).toEqual([
      'lastUpdatedAt',
      'referenceNumber',
      'status',
      'submittedAt',
    ]);
  });

  it('leaks no citizen, staff or request content', async () => {
    const client = await createClient();
    const response = await client.get('/api/v1/public/requests/DHO-2026-A7K2M9/status');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('Ahmed');
    expect(serialised).not.toContain('96891234567');
    expect(serialised).not.toContain('Building permit');
    expect(serialised).not.toContain('should never appear');
    expect(serialised).not.toContain(org.employeeA1.nameAr);
    expect(serialised).not.toContain(org.departmentA.id);
    expect(serialised).not.toContain(org.sectionA1.id);
    expect(serialised).not.toContain(citizen.id);
    expect(serialised).not.toContain(request.id);
  });

  it('reports coarse statuses, not the internal workflow', async () => {
    const client = await createClient();

    const cases = [
      ['PENDING', 'RECEIVED'],
      ['IN_PROGRESS', 'UNDER_REVIEW'],
      ['NEED_INFO', 'ACTION_REQUIRED'],
    ];

    for (const [internal, expected] of cases) {
      await prisma.request.update({ where: { id: request.id }, data: { status: internal } });
      await resetRedis();
      const response = await client.get('/api/v1/public/requests/DHO-2026-A7K2M9/status');
      expect(response.body.data.tracking.status).toBe(expected);
    }
  });

  it('makes an approval indistinguishable from a rejection', async () => {
    const client = await createClient();

    await prisma.request.update({ where: { id: request.id }, data: { status: 'APPROVED' } });
    await resetRedis();
    const approved = await client.get('/api/v1/public/requests/DHO-2026-A7K2M9/status');

    await prisma.request.update({ where: { id: request.id }, data: { status: 'REJECTED' } });
    await resetRedis();
    const rejected = await client.get('/api/v1/public/requests/DHO-2026-A7K2M9/status');

    expect(approved.body.data.tracking.status).toBe('CLOSED');
    expect(rejected.body.data.tracking.status).toBe('CLOSED');
  });

  it('answers 404 for an unknown reference', async () => {
    const client = await createClient();
    const response = await client.get('/api/v1/public/requests/DHO-2026-ZZZZZZ/status');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed reference without touching the database', async () => {
    const client = await createClient();
    const response = await client.get('/api/v1/public/requests/NOT-A-REFERENCE/status');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rate limits repeated lookups to blunt enumeration', async () => {
    const client = await createClient();
    const statuses = [];

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const suffix = String(attempt).padStart(6, '0').replace(/0/g, '2');
      const response = await client.get(`/api/v1/public/requests/DHO-2026-${suffix}/status`);
      statuses.push(response.status);
      if (response.status === 429) break;
    }

    expect(statuses).toContain(429);
  });

  it('sets no-store so a shared kiosk browser does not retain the result', async () => {
    const client = await createClient();
    const response = await client.get('/api/v1/public/requests/DHO-2026-A7K2M9/status');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('shows the owning citizen far more than the public endpoint does', async () => {
    const { client } = await signInCitizen('91234567');
    const detail = await client.get('/api/v1/citizen/requests/DHO-2026-A7K2M9');

    expect(detail.status).toBe(200);
    expect(detail.body.data.request.description).toContain('should never appear');
    expect(detail.body.data.request.title).toBe('Building permit for a residential villa');
  });
});
