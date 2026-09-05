import { COOKIE_NAMES } from '@dhofar/shared';

import {
  closeTestConnections,
  describeIntegration,
  getTestPrisma,
  getTestRedis,
  resetAll,
} from '../setup/db.js';
import { createClient, signInCitizen } from '../setup/app.js';
import { seedOrganisation } from '../setup/factories.js';

/**
 * Citizen session lifetime.
 *
 * The two-minute idle rule is the defining requirement of a public kiosk, so it
 * is tested against the server's own clock rather than through the SPA timer.
 * Expiry is simulated by ageing the stored `lastSeenAt`, which is exactly what
 * the passage of two real minutes would do.
 */
describeIntegration('citizen session expiry', () => {
  let prisma;
  let redis;

  beforeAll(() => {
    prisma = getTestPrisma();
    redis = getTestRedis();
  });

  beforeEach(async () => {
    await resetAll();
    await seedOrganisation();
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  /** Ages the session so the server sees it as idle past the limit. */
  async function ageSession(client, seconds) {
    const { hashSessionToken } = await import('../../src/infra/crypto/tokens.js');
    const token = client.jar[COOKIE_NAMES.CITIZEN_SESSION];
    const tokenHash = hashSessionToken(token);
    const key = `sess:citizen:${tokenHash}`;

    const raw = await redis.get(key);
    if (raw) {
      const state = JSON.parse(raw);
      state.lastSeenAt -= seconds * 1000;
      await redis.set(key, JSON.stringify(state), 'PX', 5 * 60 * 1000);
    }

    const past = new Date(Date.now() - seconds * 1000);
    await prisma.citizenSession.updateMany({
      where: { tokenHash },
      data: { lastSeenAt: past, idleExpiresAt: new Date(past.getTime() + 120 * 1000) },
    });

    return tokenHash;
  }

  it('keeps the session alive inside the idle window', async () => {
    const { client } = await signInCitizen('91234567');
    await ageSession(client, 60);

    const response = await client.get('/api/v1/auth/citizen/me');
    expect(response.status).toBe(200);
  });

  it('expires the session after two minutes of inactivity', async () => {
    const { client } = await signInCitizen('91234567');
    await ageSession(client, 121);

    const response = await client.get('/api/v1/auth/citizen/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('revokes the session in both Redis and the database on expiry', async () => {
    const { client } = await signInCitizen('91234567');
    const tokenHash = await ageSession(client, 121);

    await client.get('/api/v1/auth/citizen/me');

    expect(await redis.get(`sess:citizen:${tokenHash}`)).toBeNull();
    const session = await prisma.citizenSession.findUnique({ where: { tokenHash } });
    expect(session.revokedAt).not.toBeNull();
  });

  it('clears the session cookie when it expires', async () => {
    const { client } = await signInCitizen('91234567');
    await ageSession(client, 121);

    const response = await client.get('/api/v1/auth/citizen/me');
    const setCookie = (response.headers['set-cookie'] ?? []).join(';');

    expect(setCookie).toContain(COOKIE_NAMES.CITIZEN_SESSION);
  });

  it('will not accept the token again once expired', async () => {
    const { client } = await signInCitizen('91234567');
    const token = client.jar[COOKIE_NAMES.CITIZEN_SESSION];
    await ageSession(client, 121);
    await client.get('/api/v1/auth/citizen/me');

    // A replay with the captured cookie must fail too, not just this client.
    const replay = await createClient();
    replay.jar[COOKIE_NAMES.CITIZEN_SESSION] = token;
    const response = await replay.get('/api/v1/auth/citizen/me');

    expect(response.status).toBe(401);
  });

  it('blocks citizen request endpoints once the session has expired', async () => {
    const { client } = await signInCitizen('91234567');
    await ageSession(client, 121);

    const list = await client.get('/api/v1/citizen/requests');
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('slides the idle clock on activity', async () => {
    const { client } = await signInCitizen('91234567');

    await ageSession(client, 100);
    expect((await client.get('/api/v1/auth/citizen/me')).status).toBe(200);

    // The call above reset lastSeenAt, so another 100 seconds is still inside
    // the window rather than 200 seconds cumulative.
    await ageSession(client, 100);
    expect((await client.get('/api/v1/auth/citizen/me')).status).toBe(200);
  });

  it('enforces the absolute cap even while the citizen keeps interacting', async () => {
    const { client } = await signInCitizen('91234567');
    const { hashSessionToken } = await import('../../src/infra/crypto/tokens.js');
    const tokenHash = hashSessionToken(client.jar[COOKIE_NAMES.CITIZEN_SESSION]);

    const expired = Date.now() - 1000;
    const raw = await redis.get(`sess:citizen:${tokenHash}`);
    const state = JSON.parse(raw);
    state.absoluteExpiresAt = expired;
    await redis.set(`sess:citizen:${tokenHash}`, JSON.stringify(state), 'PX', 5 * 60 * 1000);
    await prisma.citizenSession.updateMany({
      where: { tokenHash },
      data: { absoluteExpiresAt: new Date(expired) },
    });

    const response = await client.get('/api/v1/auth/citizen/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('reports the remaining time so the kiosk can draw an honest countdown', async () => {
    const { client } = await signInCitizen('91234567');
    const response = await client.get('/api/v1/auth/citizen/me');

    expect(Number(response.headers['x-session-expires-in'])).toBeGreaterThan(0);
    expect(response.body.data.session.expiresInSeconds).toBeLessThanOrEqual(120);
  });

  it('falls back to the database when the Redis entry is gone', async () => {
    const { client } = await signInCitizen('91234567');
    const { hashSessionToken } = await import('../../src/infra/crypto/tokens.js');
    const tokenHash = hashSessionToken(client.jar[COOKIE_NAMES.CITIZEN_SESSION]);

    // Simulates a Redis restart or eviction mid-session.
    await redis.del(`sess:citizen:${tokenHash}`);

    const response = await client.get('/api/v1/auth/citizen/me');
    expect(response.status).toBe(200);
  });

  it('ends the previous session when the citizen signs in again', async () => {
    const first = await signInCitizen('91234567');
    const firstToken = first.client.jar[COOKIE_NAMES.CITIZEN_SESSION];

    const redisClient = getTestRedis();
    await redisClient.del('otp:cooldown:+96891234567');
    await redisClient.del('otp:phone:h:+96891234567');

    await signInCitizen('91234567');

    const replay = await createClient();
    replay.jar[COOKIE_NAMES.CITIZEN_SESSION] = firstToken;
    const response = await replay.get('/api/v1/auth/citizen/me');

    expect(response.status).toBe(401);
  });

  it('purges expired session rows in the maintenance sweep', async () => {
    const { client } = await signInCitizen('91234567');
    const tokenHash = await ageSession(client, 300);

    const { runMaintenanceSweep } = await import('../../src/modules/health/health.service.js');
    await runMaintenanceSweep();

    const session = await prisma.citizenSession.findUnique({ where: { tokenHash } });
    expect(session.revokedAt).not.toBeNull();
  });
});
