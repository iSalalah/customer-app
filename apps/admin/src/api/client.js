import { COOKIE_NAMES, ERROR_CODE, HEADER_NAMES } from '@dhofar/shared';

/**
 * Staff API client.
 *
 * Same principles as the kiosk client: cookies carry the credentials, this file
 * never touches a token, and the only cookie it reads is the CSRF value it
 * echoes back in a header.
 *
 * One addition: a 401 on an ordinary call triggers a single silent refresh, so a
 * staff member working through a shift is not signed out every 15 minutes when
 * the short access session rolls over.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiClientError extends Error {
  constructor({ status, code, message, details, requestId, meta, isNetworkError = false }) {
    super(message ?? 'Request failed');
    this.name = 'ApiClientError';
    this.status = status ?? 0;
    this.code = code ?? ERROR_CODE.INTERNAL_ERROR;
    this.details = details ?? [];
    this.requestId = requestId ?? null;
    this.meta = meta ?? null;
    this.isNetworkError = isNetworkError;
  }
}

function readCsrfToken() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAMES.CSRF}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * The CSRF cookie is issued by the API on any safe request. A staff member who
 * lands straight on the sign-in screen may not have made one yet, so the login
 * POST would be refused. One cheap GET closes that gap.
 */
let csrfPriming = null;

async function ensureCsrfToken() {
  const existing = readCsrfToken();
  if (existing) return existing;

  if (!csrfPriming) {
    csrfPriming = fetch(`${BASE_URL}/health`, { credentials: 'include', cache: 'no-store' })
      .catch(() => {})
      .finally(() => {
        csrfPriming = null;
      });
  }
  await csrfPriming;
  return readCsrfToken();
}

const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

// Concurrent 401s share one refresh attempt rather than each firing their own.
let refreshInFlight = null;

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = rawRequest('/auth/staff/refresh', { method: 'POST', skipRefresh: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function rawRequest(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (method !== 'GET' && method !== 'HEAD') {
    finalHeaders[HEADER_NAMES.CSRF] = await ensureCsrfToken();
    finalHeaders['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiClientError({ status: 0, message: error.message, isNetworkError: true });
  }

  if (response.status === 204) return null;

  const payload = await parseResponse(response);

  if (!response.ok || payload?.success === false) {
    throw new ApiClientError({
      status: response.status,
      code: payload?.error?.code,
      message: payload?.error?.message,
      details: payload?.error?.details,
      requestId: payload?.error?.requestId,
      meta: payload?.meta,
    });
  }

  return { data: payload?.data ?? null, meta: payload?.meta ?? null };
}

async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    const isAuthFailure =
      error instanceof ApiClientError &&
      (error.code === ERROR_CODE.UNAUTHENTICATED || error.code === ERROR_CODE.SESSION_EXPIRED);

    if (!isAuthFailure || options.skipRefresh) {
      if (isAuthFailure) for (const listener of unauthorizedListeners) listener();
      throw error;
    }

    const refreshed = await refreshSession();
    if (!refreshed) {
      for (const listener of unauthorizedListeners) listener();
      throw error;
    }

    return rawRequest(path, { ...options, skipRefresh: true });
  }
}

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const api = {
  login: (username, password) =>
    rawRequest('/auth/staff/login', { method: 'POST', body: { username, password }, skipRefresh: true }),
  logout: () => rawRequest('/auth/staff/logout', { method: 'POST', body: {}, skipRefresh: true }),
  me: () => request('/auth/staff/me'),

  listRequests: (params) => request(`/staff/requests${toQueryString(params)}`),
  getRequest: (requestId) => request(`/staff/requests/${requestId}`),
  listLogs: (requestId, params) => request(`/staff/requests/${requestId}/logs${toQueryString(params)}`),

  updateStatus: (requestId, body) =>
    request(`/staff/requests/${requestId}/status`, { method: 'PATCH', body }),
  updateAssignment: (requestId, assignedTo) =>
    request(`/staff/requests/${requestId}/assignment`, { method: 'PATCH', body: { assignedTo } }),
  addNote: (requestId, body) => request(`/staff/requests/${requestId}/notes`, { method: 'POST', body }),

  analyticsSummary: () => request('/staff/analytics/summary'),

  listDepartments: () => request('/departments'),
  listServices: (departmentId) => request(`/departments/${departmentId}/services`),

  attachmentUrl: (requestId, attachmentId) =>
    `${BASE_URL}/staff/requests/${requestId}/attachments/${attachmentId}`,
};

export default api;
