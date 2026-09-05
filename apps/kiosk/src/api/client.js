import { COOKIE_NAMES, ERROR_CODE, HEADER_NAMES } from '@dhofar/shared';

/**
 * API client.
 *
 * Credentials are cookies the browser attaches itself; this file never reads,
 * writes or stores a token. The only cookie it reads is the deliberately
 * non-HttpOnly CSRF token, which it echoes back in a header.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';
const KIOSK_ID = import.meta.env.VITE_KIOSK_ID ?? '';

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

  get isSessionExpired() {
    return this.code === ERROR_CODE.SESSION_EXPIRED || this.code === ERROR_CODE.UNAUTHENTICATED;
  }
}

function readCsrfToken() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAMES.CSRF}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * The CSRF cookie is issued by the API on any safe request. The home and sign-in
 * screens render entirely from local state, so a citizen's first API call can be
 * a POST - at which point no token exists yet and the request would be refused.
 * One cheap GET closes that gap.
 */
let csrfPriming = null;

async function ensureCsrfToken() {
  const existing = readCsrfToken();
  if (existing) return existing;

  // Concurrent first mutations share one priming request.
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

/**
 * Subscribers are notified when the API reports an expired session, so the
 * session provider can purge state from one place rather than every screen
 * handling 401 individually.
 */
const sessionExpiryListeners = new Set();

export function onSessionExpired(listener) {
  sessionExpiryListeners.add(listener);
  return () => sessionExpiryListeners.delete(listener);
}

function notifySessionExpired() {
  for (const listener of sessionExpiryListeners) listener();
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

async function request(path, { method = 'GET', body, headers = {}, signal, isFormData = false } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };

  if (KIOSK_ID) finalHeaders['X-Kiosk-Id'] = KIOSK_ID;
  if (method !== 'GET' && method !== 'HEAD') {
    finalHeaders[HEADER_NAMES.CSRF] = await ensureCsrfToken();
    // The browser sets the multipart boundary itself; setting Content-Type here
    // would omit it and the body would fail to parse.
    if (!isFormData) finalHeaders['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      // Cookies are the whole authentication mechanism; without this the API
      // sees an anonymous caller.
      credentials: 'include',
      cache: 'no-store',
      headers: finalHeaders,
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiClientError({ status: 0, message: error.message, isNetworkError: true });
  }

  if (response.status === 204) return null;

  const payload = await parseResponse(response);

  if (!response.ok || payload?.success === false) {
    const apiError = new ApiClientError({
      status: response.status,
      code: payload?.error?.code,
      message: payload?.error?.message,
      details: payload?.error?.details,
      requestId: payload?.error?.requestId,
      meta: payload?.meta,
    });
    if (apiError.isSessionExpired) notifySessionExpired();
    throw apiError;
  }

  return { data: payload?.data ?? null, meta: payload?.meta ?? null, headers: response.headers };
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
  // --- public -------------------------------------------------------------
  listDepartments: () => request('/departments'),
  listServices: (departmentId) => request(`/departments/${departmentId}/services`),
  trackRequest: (referenceNumber) => request(`/public/requests/${referenceNumber}/status`),

  // --- citizen authentication --------------------------------------------
  requestOtp: (phoneNumber) => request('/auth/citizen/otp/request', { method: 'POST', body: { phoneNumber } }),
  resendOtp: (phoneNumber) => request('/auth/citizen/otp/resend', { method: 'POST', body: { phoneNumber } }),
  verifyOtp: (phoneNumber, code) =>
    request('/auth/citizen/otp/verify', { method: 'POST', body: { phoneNumber, code } }),
  logout: () => request('/auth/citizen/logout', { method: 'POST' }),
  me: (signal) => request('/auth/citizen/me', { signal }),

  // --- citizen requests ---------------------------------------------------
  listMyRequests: (params) => request(`/citizen/requests${toQueryString(params)}`),
  getMyRequest: (referenceNumber) => request(`/citizen/requests/${referenceNumber}`),

  createRequest: ({ formData, idempotencyKey }) =>
    request('/citizen/requests', {
      method: 'POST',
      body: formData,
      isFormData: true,
      headers: { [HEADER_NAMES.IDEMPOTENCY_KEY]: idempotencyKey },
    }),

  addReply: ({ referenceNumber, formData }) =>
    request(`/citizen/requests/${referenceNumber}/replies`, {
      method: 'POST',
      body: formData,
      isFormData: true,
    }),

  attachmentUrl: (referenceNumber, attachmentId) =>
    `${BASE_URL}/citizen/requests/${referenceNumber}/attachments/${attachmentId}`,
};

export default api;
