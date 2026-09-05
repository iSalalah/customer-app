import { COOKIE_NAMES } from '@dhofar/shared';

import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { createClient, signInStaff } from '../setup/app.js';
import { TEST_PASSWORD, seedOrganisation } from '../setup/factories.js';

describeIntegration('staff authentication', () => {
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

  describe('sign in', () => {
    it('accepts valid credentials and sets HttpOnly cookies', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'manager.a', password: TEST_PASSWORD },
      });

      expect(response.status).toBe(200);
      expect(response.body.data.staff.username).toBe('manager.a');
      expect(response.body.data.permissions.canAssign).toBe(true);

      const cookies = response.headers['set-cookie'].join(';');
      expect(cookies).toContain(COOKIE_NAMES.STAFF_ACCESS);
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toContain('SameSite=Strict');
    });

    it('never returns a password hash or a token in the body', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'manager.a', password: TEST_PASSWORD },
      });

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain('$argon2');
      expect(response.body.data.accessToken).toBeUndefined();
      expect(response.body.data.refreshToken).toBeUndefined();
    });

    it('stores only a hash of the refresh token', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const session = await prisma.staffSession.findFirst();
      const rawToken = client.jar[COOKIE_NAMES.STAFF_REFRESH];

      expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(session.tokenHash).not.toBe(rawToken);
    });

    it('rejects a wrong password with a generic message', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'manager.a', password: 'wrong-password' },
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('gives an unknown username the same answer as a wrong password', async () => {
      const client = await createClient();
      const unknown = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'ghost.account', password: TEST_PASSWORD },
      });
      const wrong = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'manager.a', password: 'wrong-password' },
      });

      expect(unknown.status).toBe(wrong.status);
      expect(unknown.body.error.code).toBe(wrong.body.error.code);
      expect(unknown.body.error.message).toBe(wrong.body.error.message);
    });

    it('refuses a disabled account even with the correct password', async () => {
      const client = await createClient();
      const response = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'emp.disabled', password: TEST_PASSWORD },
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(await prisma.staffSession.count()).toBe(0);
    });

    it('locks the account after five failures and then refuses the right password', async () => {
      const client = await createClient();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await client.post('/api/v1/auth/staff/login', {
          body: { username: 'emp.a1', password: 'wrong-password' },
        });
        expect(response.status).toBe(401);
      }

      const fifth = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'emp.a1', password: 'wrong-password' },
      });
      expect(fifth.status).toBe(423);
      expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');

      const correct = await client.post('/api/v1/auth/staff/login', {
        body: { username: 'emp.a1', password: TEST_PASSWORD },
      });
      expect(correct.status).toBe(423);

      const staff = await prisma.staff.findUnique({ where: { username: 'emp.a1' } });
      expect(staff.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('audits both successful and failed attempts', async () => {
      const client = await createClient();
      await client.post('/api/v1/auth/staff/login', { body: { username: 'manager.a', password: 'nope' } });
      await client.post('/api/v1/auth/staff/login', {
        body: { username: 'manager.a', password: TEST_PASSWORD },
      });

      const audits = await prisma.authenticationAudit.findMany({ orderBy: { createdAt: 'asc' } });
      const events = audits.map((row) => row.eventType);

      expect(events).toContain('STAFF_LOGIN_FAILURE');
      expect(events).toContain('STAFF_LOGIN_SUCCESS');
      expect(JSON.stringify(audits)).not.toContain(TEST_PASSWORD);
    });

    it('records lastLoginAt', async () => {
      await signInStaff('manager.a', TEST_PASSWORD);
      const staff = await prisma.staff.findUnique({ where: { username: 'manager.a' } });
      expect(staff.lastLoginAt).not.toBeNull();
      expect(staff.failedLoginCount).toBe(0);
    });
  });

  describe('/me', () => {
    it('returns identity, scope and capability flags', async () => {
      const client = await signInStaff('head.a1', TEST_PASSWORD);
      const response = await client.get('/api/v1/auth/staff/me');

      expect(response.status).toBe(200);
      expect(response.body.data.staff.role).toBe('SECTION_HEAD');
      expect(response.body.data.staff.section.id).toBe(org.sectionA1.id);
      expect(response.body.data.permissions.scope).toBe('SECTION');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('refuses a staff member disabled mid-session on their very next call', async () => {
      const client = await signInStaff('emp.a1', TEST_PASSWORD);
      expect((await client.get('/api/v1/auth/staff/me')).status).toBe(200);

      await prisma.staff.update({ where: { id: org.employeeA1.id }, data: { isActive: false } });

      const response = await client.get('/api/v1/auth/staff/me');
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_DISABLED');

      // Every session for that member is revoked, not just this request.
      const sessions = await prisma.staffSession.findMany({ where: { staffId: org.employeeA1.id } });
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    });
  });

  describe('refresh rotation', () => {
    it('rotates the refresh token and keeps the session usable', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const before = client.jar[COOKIE_NAMES.STAFF_REFRESH];

      const response = await client.post('/api/v1/auth/staff/refresh', { body: {} });
      expect(response.status).toBe(200);

      const after = client.jar[COOKIE_NAMES.STAFF_REFRESH];
      expect(after).not.toBe(before);
      expect((await client.get('/api/v1/auth/staff/me')).status).toBe(200);
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const stolen = client.jar[COOKIE_NAMES.STAFF_REFRESH];

      await client.post('/api/v1/auth/staff/refresh', { body: {} });

      // An attacker replays the token captured before rotation.
      const attacker = await createClient();
      attacker.jar[COOKIE_NAMES.STAFF_REFRESH] = stolen;
      const replay = await attacker.post('/api/v1/auth/staff/refresh', { body: {} });

      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('SESSION_EXPIRED');

      const sessions = await prisma.staffSession.findMany({ where: { staffId: org.managerA.id } });
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);

      const audit = await prisma.authenticationAudit.findFirst({
        where: { eventType: 'STAFF_REFRESH_REUSE_DETECTED' },
      });
      expect(audit).not.toBeNull();
    });

    it('refuses refresh for a member disabled since sign-in', async () => {
      const client = await signInStaff('emp.a1', TEST_PASSWORD);
      await prisma.staff.update({ where: { id: org.employeeA1.id }, data: { isActive: false } });

      const response = await client.post('/api/v1/auth/staff/refresh', { body: {} });
      expect(response.status).toBe(401);
    });
  });

  describe('sign out', () => {
    it('revokes the session and clears the cookies', async () => {
      const client = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await client.post('/api/v1/auth/staff/logout', { body: {} });

      expect(response.status).toBe(200);
      expect((await client.get('/api/v1/auth/staff/me')).status).toBe(401);

      const session = await prisma.staffSession.findFirst({ where: { staffId: org.managerA.id } });
      expect(session.revokedAt).not.toBeNull();
    });
  });
});
