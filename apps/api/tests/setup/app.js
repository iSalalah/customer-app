import supertest from 'supertest';

import { COOKIE_NAMES, HEADER_NAMES } from '@dhofar/shared';

/**
 * Supertest helpers.
 *
 * The app is imported lazily so that tests/setup/env.js has already populated
 * process.env before config/env.js validates it.
 *
 * `createClient` keeps a cookie jar and mirrors what a browser does with the
 * double-submit CSRF token, so the tests exercise the real middleware chain
 * rather than bypassing it.
 */

let cachedApp = null;

export async function getApp() {
  if (!cachedApp) {
    const { createApp } = await import('../../src/app.js');
    cachedApp = createApp();
  }
  return cachedApp;
}

function parseSetCookie(header = []) {
  const jar = {};
  for (const entry of header) {
    const [pair] = entry.split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    jar[name] = value;
  }
  return jar;
}

export async function createClient() {
  const app = await getApp();
  const jar = {};

  const cookieHeader = () =>
    Object.entries(jar)
      .filter(([, value]) => value !== '')
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

  const absorb = (response) => {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) Object.assign(jar, parseSetCookie(setCookie));
    return response;
  };

  /** Fetches a CSRF cookie the way the SPA does, by making one safe request. */
  const primeCsrf = async () => {
    if (jar[COOKIE_NAMES.CSRF]) return;
    absorb(await supertest(app).get('/api/v1/health'));
  };

  const send = async (method, path, { body, form, headers = {}, csrf = true } = {}) => {
    if (csrf && method !== 'get') await primeCsrf();

    let request = supertest(app)[method](path);
    const cookies = cookieHeader();
    if (cookies) request = request.set('Cookie', cookies);
    if (csrf && method !== 'get' && jar[COOKIE_NAMES.CSRF]) {
      request = request.set(HEADER_NAMES.CSRF, jar[COOKIE_NAMES.CSRF]);
    }
    for (const [name, value] of Object.entries(headers)) request = request.set(name, value);

    if (form) {
      for (const [field, value] of Object.entries(form.fields ?? {})) request = request.field(field, value);
      for (const file of form.files ?? []) {
        request = request.attach(file.field ?? 'attachments', file.buffer, {
          filename: file.filename,
          contentType: file.contentType,
        });
      }
    } else if (body !== undefined) {
      request = request.send(body);
    }

    return absorb(await request);
  };

  return {
    jar,
    get: (path, options) => send('get', path, options),
    post: (path, options) => send('post', path, options),
    patch: (path, options) => send('patch', path, options),
    delete: (path, options) => send('delete', path, options),
    hasCookie: (name) => Boolean(jar[name]),
    clearCookies: () => {
      for (const key of Object.keys(jar)) delete jar[key];
    },
  };
}

/** Signs a staff member in and returns a client carrying their session. */
export async function signInStaff(username, password) {
  const client = await createClient();
  const response = await client.post('/api/v1/auth/staff/login', { body: { username, password } });
  if (response.status !== 200) {
    throw new Error(`staff sign-in failed for ${username}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return client;
}

/** Runs the full OTP flow and returns a client carrying the citizen session. */
export async function signInCitizen(phoneNumber) {
  const { readSentMessages, clearSentMessages } = await import('../../src/infra/sms/mockSmsProvider.js');
  clearSentMessages();

  const client = await createClient();
  const requested = await client.post('/api/v1/auth/citizen/otp/request', { body: { phoneNumber } });
  if (requested.status !== 202) {
    throw new Error(`otp request failed: ${requested.status} ${JSON.stringify(requested.body)}`);
  }

  const sent = readSentMessages();
  const message = sent[sent.length - 1];
  if (!message) throw new Error('no OTP was dispatched to the mock provider');

  const verified = await client.post('/api/v1/auth/citizen/otp/verify', {
    body: { phoneNumber, code: message.code },
  });
  if (verified.status !== 200) {
    throw new Error(`otp verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  }

  return { client, citizen: verified.body.data.citizen, code: message.code };
}
