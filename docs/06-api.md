# 06 — REST API Reference

Base path: `/api/v1`. Every response uses the envelope in §15 of the specification.
Interactive documentation: `GET /api/docs` (Swagger UI), spec at `GET /api/docs.json`.

Auth column legend — `none` · `citizen` (citizen session cookie) · `staff` (staff access
cookie) · `+csrf` (also requires the `X-CSRF-Token` header).

## Public

| Method | Path | Auth | Purpose | Rate limit |
|---|---|---|---|---|
| GET | `/health` | none | Liveness. Always 200 if the process is up. | global |
| GET | `/ready` | none | Readiness: MySQL + Redis round-trip. 503 when degraded. | global |
| GET | `/departments` | none | Active departments (`id`, `nameAr`, `nameEn`). | global |
| GET | `/departments/:departmentId/services` | none | Active services for a department, with the resolved target section. | global |
| GET | `/public/requests/:referenceNumber/status` | none | Minimal tracking: reference, coarse public status, `submittedAt`, `lastUpdatedAt`. Nothing else. | **tracking: 10/5 min/IP** |

## Citizen authentication

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/citizen/otp/request` | none +csrf | `{ phoneNumber }` | Always 202 with `{ resendAvailableInSeconds, expiresInSeconds }`. Never reveals whether the citizen exists. Limits: 3/hour/phone, 10/hour/IP, 5/15 min/IP burst. |
| POST | `/auth/citizen/otp/verify` | none +csrf | `{ phoneNumber, code }` | 200 sets the session cookie and creates the citizen row on first successful verification. Wrong code → 401 `OTP_INVALID` (generic). 5 attempts then `OTP_LOCKED`. |
| POST | `/auth/citizen/otp/resend` | none +csrf | `{ phoneNumber }` | Honours the 60 s cooldown; supersedes the previous challenge. |
| POST | `/auth/citizen/logout` | citizen +csrf | — | Revokes the session in Redis **and** MySQL, clears cookies. |
| GET | `/auth/citizen/me` | citizen | — | `{ id, phoneMasked, fullName, session: { idleTimeoutSeconds, expiresInSeconds } }`. |

## Citizen requests

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/citizen/requests` | citizen | `?page&pageSize&status&from&to&sort`. Own requests only, enforced in the service. |
| POST | `/citizen/requests` | citizen +csrf | `multipart/form-data`: `serviceId`, `title`, `description`, `attachments[]` (≤5). Header `Idempotency-Key` required. 201 → `{ referenceNumber, status, trackingUrl }`. |
| GET | `/citizen/requests/:referenceNumber` | citizen | Detail with `CITIZEN_VISIBLE` timeline only. No assignee, no internal notes. |
| POST | `/citizen/requests/:referenceNumber/attachments` | citizen +csrf | Add files to an existing own request, within the 5-file ceiling. |
| GET | `/citizen/requests/:referenceNumber/attachments/:attachmentId` | citizen | Streamed download, `Content-Disposition: attachment`, ownership re-checked. |
| POST | `/citizen/requests/:referenceNumber/replies` | citizen +csrf | Body `{ message }` plus optional files. Only while status is `NEED_INFO`. |

## Staff authentication

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/staff/login` | none +csrf | `{ username, password }`. Argon2id verify, constant-time. 5 failures → 15 min lockout. Sets access + refresh cookies. |
| POST | `/auth/staff/refresh` | refresh cookie +csrf | Rotates the refresh token. Reuse of a rotated token revokes the entire family and audits `STAFF_REFRESH_REUSE_DETECTED`. |
| POST | `/auth/staff/logout` | staff +csrf | Revokes the session row and clears cookies. |
| GET | `/auth/staff/me` | staff | `{ id, nameAr, nameEn, role, department, section, permissions }`. Never a hash. |

## Staff operations

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/staff/requests` | all | `?page&pageSize&status&departmentId&sectionId&assignedTo&serviceId&from&to&q&sort`. Filters are **intersected** with the caller's scope; a wider filter narrows, never widens. |
| GET | `/staff/requests/:requestId` | all | Full detail incl. internal notes, within scope. |
| PATCH | `/staff/requests/:requestId/assignment` | MANAGER, SECTION_HEAD | `{ assignedTo }` (or `null` to unassign). Assignee must be active, same department, and same section when the request has one. |
| PATCH | `/staff/requests/:requestId/status` | all | `{ status, note?, noteVisibility? }`. `NEED_INFO` requires a `CITIZEN_VISIBLE` note. |
| POST | `/staff/requests/:requestId/notes` | all | `{ message, visibility }`. `INTERNAL` never reaches a citizen. |
| GET | `/staff/requests/:requestId/logs` | all | Full timeline, paginated. |
| GET | `/staff/requests/:requestId/attachments/:attachmentId` | all | Streamed download; `INFECTED` files are refused 403. |
| GET | `/staff/analytics/summary` | all | Scope derived from the caller's role, never from a parameter. |

## Error codes

| HTTP | `error.code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod rejection; `details[]` carries `{ path, message, messageAr }`. |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Missing `Idempotency-Key` on request creation. |
| 401 | `UNAUTHENTICATED` | No/!valid session cookie. |
| 401 | `SESSION_EXPIRED` | Citizen idle or absolute expiry. Kiosk treats this as "reset to home". |
| 401 | `OTP_INVALID` | Wrong or expired code (deliberately merged). |
| 401 | `INVALID_CREDENTIALS` | Staff login failure (never says which field). |
| 403 | `FORBIDDEN` | Authenticated but outside scope/role. |
| 403 | `CSRF_TOKEN_INVALID` | Double-submit mismatch. |
| 403 | `ACCOUNT_DISABLED` | `isActive = false`. |
| 404 | `NOT_FOUND` | Also returned instead of 403 where existence itself is sensitive. |
| 409 | `INVALID_STATUS_TRANSITION` | Not permitted by the matrix. |
| 409 | `REQUEST_IS_TERMINAL` | `APPROVED` / `REJECTED`. |
| 409 | `DUPLICATE_SUBMISSION` | Idempotency key already used with different content. |
| 413 | `FILE_TOO_LARGE` | > 10 MB. |
| 415 | `UNSUPPORTED_FILE_TYPE` | Declared MIME or magic bytes not in the allowlist. |
| 422 | `ATTACHMENT_LIMIT_EXCEEDED` | > 5 per request. |
| 423 | `ACCOUNT_LOCKED` / `OTP_LOCKED` | Temporary lockout; `retryAfterSeconds` in `meta`. |
| 429 | `RATE_LIMITED` | `Retry-After` header set. |
| 500 | `INTERNAL_ERROR` | Generic. Details go to the log under `requestId` only. |
| 503 | `SERVICE_UNAVAILABLE` | Readiness failure / dependency down. |
