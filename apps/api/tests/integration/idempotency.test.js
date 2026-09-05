import { Prisma } from '@prisma/client';

import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { signInCitizen } from '../setup/app.js';
import { seedOrganisation } from '../setup/factories.js';

/**
 * Duplicate suppression and reference-number collision handling.
 *
 * On a touchscreen a double tap is the normal case, not the edge case, so these
 * are behaviour tests rather than defensive ones.
 */
describeIntegration('idempotency and reference-number generation', () => {
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

  const body = (serviceId) => ({
    fields: {
      serviceId,
      title: 'Waste collection at Al Saada district',
      description: 'Construction debris has been left on the pavement for several days.',
    },
  });

  it('returns the original reference when the same key is replayed', async () => {
    const { client } = await signInCitizen('91234567');

    const first = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'double-tap' },
      form: body(org.serviceA1.id),
    });
    const second = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'double-tap' },
      form: body(org.serviceA1.id),
    });

    expect(first.status).toBe(201);
    // A replay is a success, not a conflict - the citizen's request exists.
    expect(second.status).toBe(200);
    expect(second.body.data.referenceNumber).toBe(first.body.data.referenceNumber);
    expect(await prisma.request.count()).toBe(1);
  });

  it('creates separate requests for different keys', async () => {
    const { client } = await signInCitizen('91234567');

    const first = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'submission-a' },
      form: body(org.serviceA1.id),
    });
    const second = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'submission-b' },
      form: body(org.serviceA1.id),
    });

    expect(first.body.data.referenceNumber).not.toBe(second.body.data.referenceNumber);
    expect(await prisma.request.count()).toBe(2);
  });

  it('scopes the key to the citizen, so two people may reuse the same value', async () => {
    const first = await signInCitizen('91234567');
    const created = await first.client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'shared-key' },
      form: body(org.serviceA1.id),
    });

    const second = await signInCitizen('99887766');
    const other = await second.client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'shared-key' },
      form: body(org.serviceA1.id),
    });

    expect(created.status).toBe(201);
    expect(other.status).toBe(201);
    expect(other.body.data.referenceNumber).not.toBe(created.body.data.referenceNumber);
    expect(await prisma.request.count()).toBe(2);
  });

  it('survives concurrent submissions of the same key', async () => {
    const { client } = await signInCitizen('91234567');

    // Fired together: one wins the unique index, the other reads its result.
    const responses = await Promise.all([
      client.post('/api/v1/citizen/requests', {
        headers: { 'Idempotency-Key': 'race-key' },
        form: body(org.serviceA1.id),
      }),
      client.post('/api/v1/citizen/requests', {
        headers: { 'Idempotency-Key': 'race-key' },
        form: body(org.serviceA1.id),
      }),
    ]);

    for (const response of responses) {
      expect([200, 201]).toContain(response.status);
    }
    expect(responses[0].body.data.referenceNumber).toBe(responses[1].body.data.referenceNumber);
    expect(await prisma.request.count()).toBe(1);
  });

  it('recovers from a reference-number collision by generating a new one', async () => {
    const { setReferenceGenerator } = await import('../../src/modules/requests/requests.service.js');
    const { generateReferenceNumber } = await import('../../src/infra/crypto/reference.js');
    const { client } = await signInCitizen('91234567');

    const first = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'collision-1' },
      form: body(org.serviceA1.id),
    });
    const taken = first.body.data.referenceNumber;

    // The generator hands back an already-used reference on its first call, so
    // the retry loop is genuinely exercised rather than assumed.
    let calls = 0;
    setReferenceGenerator(() => {
      calls += 1;
      return calls === 1 ? taken : generateReferenceNumber();
    });

    try {
      const second = await client.post('/api/v1/citizen/requests', {
        headers: { 'Idempotency-Key': 'collision-2' },
        form: body(org.serviceA1.id),
      });

      expect(calls).toBeGreaterThanOrEqual(2);
      expect(second.status).toBe(201);
      expect(second.body.data.referenceNumber).not.toBe(taken);
      expect(await prisma.request.count()).toBe(2);
    } finally {
      setReferenceGenerator(null);
    }
  });

  it('gives up cleanly when every retry collides', async () => {
    const { setReferenceGenerator } = await import('../../src/modules/requests/requests.service.js');
    const { client } = await signInCitizen('91234567');

    const first = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'exhaust-1' },
      form: body(org.serviceA1.id),
    });
    const taken = first.body.data.referenceNumber;

    setReferenceGenerator(() => taken);

    try {
      const second = await client.post('/api/v1/citizen/requests', {
        headers: { 'Idempotency-Key': 'exhaust-2' },
        form: body(org.serviceA1.id),
      });

      expect(second.status).toBe(500);
      expect(second.body.error.code).toBe('INTERNAL_ERROR');
      // No stack trace, SQL fragment or column name reaches the caller.
      expect(JSON.stringify(second.body)).not.toMatch(/prisma|referenceNumber|at Object/i);
      // And crucially, no half-written request survives.
      expect(await prisma.request.count()).toBe(1);
    } finally {
      setReferenceGenerator(null);
    }
  });

  it('leaves nothing behind when the transaction fails', async () => {
    const { client } = await signInCitizen('91234567');

    // A foreign key that does not exist makes the transaction fail after the
    // reference has been generated.
    const missingServiceId = '00000000-0000-4000-8000-000000000000';
    const response = await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'rollback-key' },
      form: body(missingServiceId),
    });

    expect(response.status).toBe(422);
    expect(await prisma.request.count()).toBe(0);
    expect(await prisma.attachment.count()).toBe(0);
    expect(await prisma.requestLog.count()).toBe(0);
  });

  it('keeps the unique constraint on (citizenId, idempotencyKey)', async () => {
    const { client, citizen } = await signInCitizen('91234567');
    await client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': 'constraint-key' },
      form: body(org.serviceA1.id),
    });

    // A direct insert bypassing the service must still be refused by the index.
    await expect(
      prisma.request.create({
        data: {
          referenceNumber: 'DHO-2026-ZZZZZZ',
          idempotencyKey: 'constraint-key',
          citizenId: citizen.id,
          serviceId: org.serviceA1.id,
          departmentId: org.departmentA.id,
          sectionId: org.sectionA1.id,
          title: 'Direct insert',
          description: 'A description that is comfortably longer than twenty characters.',
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
