import { COOKIE_NAMES } from '@dhofar/shared';

import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { createClient, signInCitizen } from '../setup/app.js';

const PHONE = '91234567';
const NORMALIZED = '+96891234567';

describeIntegration('citizen OTP authentication', () => {
  let prisma;
  let mock;

  beforeAll(async () => {
    prisma = getTestPrisma();
    mock = await import('../../src/infra/sms/mockSmsProvider.js');
  });

  beforeEach(async () => {
    await resetAll();
    mock.clearSentMessages();
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  describe('requesting a code', () => {
    it('accepts a valid Oman number and reports the timings', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });

      expect(response.status).toBe(202);
      expect(response.body.data).toMatchObject({
        expiresInSeconds: 300,
        resendAvailableInSeconds: 60,
        maxAttempts: 5,
      });
    });

    it('never returns the code itself', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });
      const [sent] = mock.readSentMessages();

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain(sent.code);
      expect(response.body.data.code).toBeUndefined();
    });

    it('stores only a hash, never the plaintext code', async () => {
      const client = await createClient();
      await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });

      const [sent] = mock.readSentMessages();
      const challenge = await prisma.otpChallenge.findFirst({ where: { phoneNumber: NORMALIZED } });

      expect(challenge.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(challenge.codeHash).not.toContain(sent.code);
    });

    it('answers identically for a known and an unknown citizen', async () => {
      await prisma.citizen.create({ data: { phoneNumber: NORMALIZED } });

      const known = await createClient();
      const knownResponse = await known.post('/api/v1/auth/citizen/otp/request', {
        body: { phoneNumber: PHONE },
      });

      const unknown = await createClient();
      const unknownResponse = await unknown.post('/api/v1/auth/citizen/otp/request', {
        body: { phoneNumber: '99887766' },
      });

      expect(knownResponse.status).toBe(unknownResponse.status);
      expect(knownResponse.body.data).toEqual(unknownResponse.body.data);
    });

    it('rejects a malformed phone number', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: '123' } });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a request without the CSRF header', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/citizen/otp/request', {
        body: { phoneNumber: PHONE },
        csrf: false,
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('invalidates the previous challenge when a new one is issued', async () => {
      const client = await createClient();
      await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });

      // Clear the cooldown so a second issue is allowed.
      const redis = (await import('../setup/db.js')).getTestRedis();
      await redis.del(`otp:cooldown:${NORMALIZED}`);

      await client.post('/api/v1/auth/citizen/otp/resend', { body: { phoneNumber: PHONE } });

      const challenges = await prisma.otpChallenge.findMany({
        where: { phoneNumber: NORMALIZED },
        orderBy: { createdAt: 'asc' },
      });

      expect(challenges).toHaveLength(2);
      expect(challenges[0].invalidatedAt).not.toBeNull();
      expect(challenges[1].invalidatedAt).toBeNull();
    });

    it('enforces the resend cooldown', async () => {
      const client = await createClient();
      await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });

      const second = await client.post('/api/v1/auth/citizen/otp/resend', { body: { phoneNumber: PHONE } });

      expect(second.status).toBe(429);
      expect(second.body.meta.retryAfterSeconds).toBeGreaterThan(0);
      expect(second.headers['retry-after']).toBeDefined();
    });

    it('enforces the hourly per-phone budget', async () => {
      const redis = (await import('../setup/db.js')).getTestRedis();
      const client = await createClient();

      let lastStatus = 0;
      // Three sends are allowed per hour; clear only the cooldown between them
      // so the hourly counter is what eventually trips.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await redis.del(`otp:cooldown:${NORMALIZED}`);
        const response = await client.post('/api/v1/auth/citizen/otp/request', {
          body: { phoneNumber: PHONE },
        });
        lastStatus = response.status;
        if (lastStatus === 429) break;
      }

      expect(lastStatus).toBe(429);
      const challenges = await prisma.otpChallenge.count({ where: { phoneNumber: NORMALIZED } });
      expect(challenges).toBeLessThanOrEqual(3);
    });
  });

  describe('verifying a code', () => {
    it('opens a session and creates the citizen on first verification', async () => {
      expect(await prisma.citizen.count()).toBe(0);

      const { client, citizen } = await signInCitizen(PHONE);

      expect(citizen.phoneMasked).toContain('*');
      expect(citizen.phoneMasked).not.toBe(NORMALIZED);
      expect(client.hasCookie(COOKIE_NAMES.CITIZEN_SESSION)).toBe(true);
      expect(await prisma.citizen.count()).toBe(1);
    });

    it('reuses the existing citizen on a later sign-in', async () => {
      await signInCitizen(PHONE);
      await resetOtpState();
      await signInCitizen(PHONE);
      expect(await prisma.citizen.count()).toBe(1);
    });

    it('consumes the challenge so the same code cannot be replayed', async () => {
      const { code } = await signInCitizen(PHONE);

      const replay = await createClient();
      const response = await replay.post('/api/v1/auth/citizen/otp/verify', {
        body: { phoneNumber: PHONE, code },
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });

    it('returns the same generic error for a wrong code and no challenge at all', async () => {
      const noChallenge = await createClient();
      const withoutChallenge = await noChallenge.post('/api/v1/auth/citizen/otp/verify', {
        body: { phoneNumber: PHONE, code: '000000' },
      });

      const client = await createClient();
      await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });
      const wrongCode = await client.post('/api/v1/auth/citizen/otp/verify', {
        body: { phoneNumber: PHONE, code: '000000' },
      });

      expect(withoutChallenge.status).toBe(wrongCode.status);
      expect(withoutChallenge.body.error.code).toBe(wrongCode.body.error.code);
      expect(withoutChallenge.body.error.message).toBe(wrongCode.body.error.message);
    });

    it('locks the challenge after five incorrect attempts', async () => {
      const client = await createClient();
      await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });
      const [sent] = mock.readSentMessages();
      const wrong = sent.code === '000000' ? '111111' : '000000';

      const statuses = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await client.post('/api/v1/auth/citizen/otp/verify', {
          body: { phoneNumber: PHONE, code: wrong },
        });
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 4)).toEqual([401, 401, 401, 401]);
      expect(statuses[4]).toBe(423);

      // Even the CORRECT code is now refused: the challenge is dead.
      const afterLock = await client.post('/api/v1/auth/citizen/otp/verify', {
        body: { phoneNumber: PHONE, code: sent.code },
      });
      expect(afterLock.status).toBe(401);
    });

    it('rejects an expired challenge', async () => {
      const client = await createClient();
      await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber: PHONE } });
      const [sent] = mock.readSentMessages();

      await prisma.otpChallenge.updateMany({
        where: { phoneNumber: NORMALIZED },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await client.post('/api/v1/auth/citizen/otp/verify', {
        body: { phoneNumber: PHONE, code: sent.code },
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });

    it('writes an audit row with a masked phone number and no code', async () => {
      await signInCitizen(PHONE);
      const audit = await prisma.authenticationAudit.findFirst({
        where: { eventType: 'CITIZEN_OTP_VERIFY_SUCCESS' },
      });

      expect(audit).not.toBeNull();
      expect(audit.identifier).toContain('*');
      expect(audit.identifier).not.toBe(NORMALIZED);
      expect(JSON.stringify(audit)).not.toMatch(/"code"/);
    });
  });

  describe('session endpoints', () => {
    it('returns the citizen and remaining time from /me', async () => {
      const { client } = await signInCitizen(PHONE);
      const response = await client.get('/api/v1/auth/citizen/me');

      expect(response.status).toBe(200);
      expect(response.body.data.session.idleTimeoutSeconds).toBe(120);
      expect(response.body.data.citizen.phoneMasked).toContain('*');
      // The response must never carry the raw phone number or an id-less token.
      expect(JSON.stringify(response.body)).not.toContain(NORMALIZED);
    });

    it('sets no-store on authenticated responses', async () => {
      const { client } = await signInCitizen(PHONE);
      const response = await client.get('/api/v1/auth/citizen/me');
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('revokes the session on logout, in Redis and in the database', async () => {
      const { client } = await signInCitizen(PHONE);
      const logout = await client.post('/api/v1/auth/citizen/logout', { body: {} });

      expect(logout.status).toBe(200);

      const sessions = await prisma.citizenSession.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].revokedAt).not.toBeNull();

      const after = await client.get('/api/v1/auth/citizen/me');
      expect(after.status).toBe(401);
    });

    it('refuses /me without a session', async () => {
      const client = await createClient();
      const response = await client.get('/api/v1/auth/citizen/me');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  async function resetOtpState() {
    const redis = (await import('../setup/db.js')).getTestRedis();
    await redis.del(`otp:cooldown:${NORMALIZED}`);
    await redis.del(`otp:phone:h:${NORMALIZED}`);
    await prisma.otpChallenge.deleteMany({});
    mock.clearSentMessages();
  }
});
