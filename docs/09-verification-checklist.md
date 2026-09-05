# 09 — Final Verification Checklist

Every row states where the requirement is implemented and how it is proven.
"Verified by test" means a named test asserts the behaviour; "verified by
inspection" means it is a structural property of the code with no meaningful
runtime assertion available.

## 1. Technology constraints

| Requirement | Status | Evidence |
|---|---|---|
| No TypeScript anywhere | ✅ | No `.ts`/`.tsx` file is authored in this repo; no TS compiler in any build. Prisma's generated `.d.ts` inside `node_modules` is vendor output (`docs/01-assumptions.md` A2) |
| ES modules, `"type": "module"` | ✅ | Every `package.json` |
| Node + Express + MySQL + Prisma + Zod + Redis + Multer + Helmet + CORS + express-rate-limit + Pino + Jest + Supertest + Swagger | ✅ | `apps/api/package.json` |
| React + Vite, JS/JSX only | ✅ | `apps/kiosk`, `apps/admin` |
| Exact pinned versions | ✅ | No `^` or `~` in any dependency |
| Docker, MySQL, Redis, local storage, S3 adapter, mock SMS, real SMS adapter | ✅ | `docker-compose.yml`, `src/infra/storage`, `src/infra/sms` |

## 2. Project structure

| Requirement | Status | Evidence |
|---|---|---|
| Monorepo `apps/api`, `apps/kiosk`, `apps/admin`, `packages/shared`, `docker`, `docs` | ✅ | `docs/00-tree.md` |
| Feature modules with routes / controllers / services / repositories / schemas separated | ✅ | `src/modules/*` — every module has the same five files |
| Business logic outside controllers | ✅ | Controllers only call a service and a response helper |
| Prisma confined to repositories | ✅ | Within `src/modules`, only `*.repository.js` imports the client (`health.service.js` imports the `pingDatabase` helper, not the client). The session and audit infrastructure outside `src/modules` also uses it — see `docs/02-architecture.md` for why |

## 3. Languages and UX

| Requirement | Status | Evidence |
|---|---|---|
| Arabic default, English optional | ✅ | `DEFAULT_LOCALE = 'ar'`; `I18nProvider` |
| Correct RTL/LTR switching | ✅ | `document.documentElement.dir` set from `directionFor(locale)`; logical CSS properties throughout |
| Bilingual validation messages | ✅ | `middleware/validate.js` emits `message` + `messageAr`; SPAs map codes via `error.*` keys |
| Touch targets ≥ 48×48 | ✅ | `--touch-min: 56px` on the kiosk, 44px on the desk-based dashboard; applied to `.btn`, `.input`, `.keyboard__key`, `.tile` |
| High contrast | ✅ | Body text 15.8:1, muted 7.4:1 on surface; `prefers-contrast: more` strengthens borders |
| Visible focus states | ✅ | `:focus-visible { outline: 4px solid }`, never removed |
| Virtual keyboard integration layer | ✅ | `components/VirtualKeyboard.jsx` — Arabic, Latin and numeric layouts |
| No hover / right-click / complex scroll dependency | ✅ | Every action is a `<button>` or `<a>`; hover only changes colour |
| Responsive for kiosk sizes | ✅ | Portrait-kiosk and small-tablet breakpoints in `styles/base.css` |
| WCAG 2.1 AA principles | ✅ | Skip link, landmarks, labelled controls, `aria-live` regions, focus-trapped modal, `prefers-reduced-motion` |
| No hard-coded user-facing strings in components | ✅ | All text via `t(key)`; missing keys warn in dev |

## 4–5. Users, kiosk features

| Requirement | Status | Evidence |
|---|---|---|
| Citizen phone + OTP auth | ✅ | Verified by test — `integration/citizenAuth.test.js` |
| Citizen sees only own requests | ✅ | Verified by test — `requests.test.js` "lists only the signing-in citizen's own requests" |
| Citizen cannot reach staff pages or internal notes | ✅ | Verified by test — `notePrivacy.test.js`, `rbac.test.js` |
| Staff username + password auth | ✅ | Verified by test — `staffAuth.test.js` |
| Home / OTP / dashboard / wizard / details / public tracking screens | ✅ | `apps/kiosk/src/screens/*` |
| Pagination, status and date filters | ✅ | `Dashboard.jsx`; verified by test — `requests.test.js` "paginates and filters by status" |
| Duplicate submission prevention | ✅ | Verified by test — `idempotency.test.js` (5 cases incl. a concurrent race) |
| Reference number shown, printable, QR of tracking URL | ✅ | `Receipt.jsx`, `QrCode.jsx`, `styles/print.css` |
| `NEED_INFO` reply path | ✅ | Verified by test — `requests.test.js` "accepts a reply only while the status is NEED_INFO" |
| Public tracking returns minimal non-sensitive data | ✅ | Verified by test — `tracking.test.js` "returns exactly four fields", "leaks no citizen, staff or request content" |
| Public tracking rate limited | ✅ | Verified by test — `tracking.test.js` "rate limits repeated lookups" |

## 6. Kiosk session security

| Requirement | Status | Evidence |
|---|---|---|
| 2-minute idle expiry | ✅ | Verified by test — `session.test.js` "expires the session after two minutes of inactivity" |
| Enforced server-side, not only by a JS timer | ✅ | Verified by test — expiry is asserted by ageing server state, with no browser involved |
| Warning before expiry | ✅ | `IdleWarningDialog.jsx` at 30 s |
| Timeout resets on legitimate interaction | ✅ | Verified by test — `session.test.js` "slides the idle clock on activity" |
| Session invalidated on expiry | ✅ | Verified by test — "revokes the session in both Redis and the database" |
| Citizen data, auth state, form state, temp attachments cleared | ✅ | `session/purge.js` — query cache cleared, storages cleared, object URLs revoked; attachments are memory-buffered and never written to disk before commit |
| Return to public home screen | ✅ | `SessionProvider.clearLocally` → `navigate('/', { replace: true })` |
| Browser-back cannot show previous citizen data | ✅ | `resetHistoryToHome()` + `popstate` trap + `no-store` on every authenticated response |
| Caching disabled for sensitive pages | ✅ | Verified by test — `citizenAuth.test.js` "sets no-store on authenticated responses" |
| Nothing sensitive in `localStorage` | ✅ | Verified by inspection — no `localStorage` write exists in the kiosk app; `purge.js` clears it defensively |
| Secure, HttpOnly, SameSite cookies | ✅ | Verified by test — `staffAuth.test.js` asserts `HttpOnly` and `SameSite=Strict`; `COOKIE_SECURE` forced true in production |
| Explicit logout | ✅ | "End session" button on every authenticated screen |
| CSRF protection | ✅ | Verified by test — `citizenAuth.test.js` "rejects a request without the CSRF header" |

## 7. OTP security

| Requirement | Status | Evidence |
|---|---|---|
| Cryptographically secure 6-digit code | ✅ | `crypto.randomInt`; verified by test — `unit/otp.test.js` |
| 5-minute validity | ✅ | Verified by test — `citizenAuth.test.js` "rejects an expired challenge" |
| 60-second resend cooldown | ✅ | Verified by test — "enforces the resend cooldown" |
| Max 5 verification attempts | ✅ | Verified by test — "locks the challenge after five incorrect attempts" |
| Per-phone and per-IP limits, hourly cap | ✅ | Verified by test — "enforces the hourly per-phone budget" |
| Never stored in plaintext | ✅ | Verified by test — "stores only a hash, never the plaintext code" |
| HMAC-SHA256 under `OTP_PEPPER` | ✅ | `infra/crypto/otp.js` |
| Safe comparison | ✅ | `timingSafeEqual` with a length pre-check; verified by test — `unit/otp.test.js` |
| Invalidated after success | ✅ | Verified by test — "consumes the challenge so the same code cannot be replayed" |
| Previous OTPs invalidated on reissue | ✅ | Verified by test — "invalidates the previous challenge when a new one is issued" |
| Never logged | ✅ | Pino redaction list covers `code`, `otp`, `codeHash`; mock provider prints via `console.warn` only |
| Never returned by the API | ✅ | Verified by test — "never returns the code itself" |
| Dev-only console print | ✅ | Guarded by `config.isDevelopment` in `mockSmsProvider.js` |
| Scheduled/lazy cleanup | ✅ | `purgeExpiredOtpChallenges` on a 15-minute sweep |

## 8. Staff authentication

| Requirement | Status | Evidence |
|---|---|---|
| Argon2id | ✅ | `infra/crypto/password.js` (m=19456, t=2, p=1) |
| Short access session, rotated refresh | ✅ | 15 min / 8 h; verified by test — "rotates the refresh token" |
| HttpOnly, Secure, SameSite cookies | ✅ | Verified by test |
| Login rate limiting | ✅ | `staffLoginLimiter` |
| Temporary lockout after repeated failures | ✅ | Verified by test — "locks the account after five failures" |
| Session revocation on logout | ✅ | Verified by test |
| Hashed session tokens in the database | ✅ | Verified by test — "stores only a hash of the refresh token" |
| Authentication audit events | ✅ | Verified by test — "audits both successful and failed attempts" |
| No tokens in `localStorage` | ✅ | Verified by inspection — the admin client never touches storage |
| No hashes or secrets in responses/logs | ✅ | Verified by test — "never returns a password hash or a token in the body" |
| Disabled staff cannot authenticate or receive assignments | ✅ | Verified by test — `staffAuth.test.js` + `rbac.test.js` "refuses assigning to a disabled staff member" |

## 9–11. Organisation, workflow, reference numbers

| Requirement | Status | Evidence |
|---|---|---|
| Department / Section / MunicipalService model | ✅ | `schema.prisma` |
| Backend derives `departmentId`/`sectionId` from the service | ✅ | Verified by test — `requests.test.js` "routes to the service's own department and section" |
| Client-supplied routing rejected | ✅ | Verified by test — "derives the department and section from the service, not the client" |
| Five statuses and the exact transition matrix | ✅ | Verified by test — `unit/statusMatrix.test.js` asserts all 25 cells |
| Employee/section-head/manager update scopes | ✅ | Verified by test — `rbac.test.js`, `unit/policies.test.js` |
| Assignee must be active, same department, same section | ✅ | Verified by test — `rbac.test.js` (4 cases) |
| Every significant action writes an immutable log | ✅ | Verified by test — `requests.test.js`, `rbac.test.js`; no update/delete path exists for `RequestLog` |
| Update and log in one transaction | ✅ | `updateStatusTransaction`, `updateAssignmentTransaction` |
| Internal notes never exposed to citizens | ✅ | Verified by test — `notePrivacy.test.js` (7 cases) |
| Terminal requests immutable | ✅ | Verified by test — "refuses any change once the request is terminal" |
| `DHO-YYYY-XXXXXX`, crypto-generated, unique index, retry on collision | ✅ | Verified by test — `unit/reference.test.js`, `idempotency.test.js` collision + exhaustion cases |
| No `Math.random()` | ✅ | Verified by inspection — `grep -rn "Math.random" src/` returns nothing |
| Idempotency key with a uniqueness rule | ✅ | `@@unique([citizenId, idempotencyKey])`; verified by test |
| Request + reference + log + attachments in one transactional workflow | ✅ | `createRequestTransaction`; verified by test — "leaves nothing behind when the transaction fails" |

## 12. Database

| Requirement | Status | Evidence |
|---|---|---|
| All required models and enums | ✅ | `schema.prisma`; the two additions (`AttachmentScanStatus`, `AuthEventType`) are explained in `docs/01-assumptions.md` B7 |
| Keys, unique constraints, FKs, composite constraints, referential actions | ✅ | `schema.prisma` + `migrations/20260101000000_init/migration.sql` |
| Indexes on status, citizen, department, section, assignee, reference, phone, service, createdAt | ✅ | `docs/05-database.md` index table |
| `createdAt` / `updatedAt` everywhere | ✅ | `schema.prisma` |
| Deactivation instead of deletion | ✅ | `isActive` on Department, Section, MunicipalService, Staff; `onDelete: Restrict` on the records that must survive |
| UTC storage, Asia/Muscat display | ✅ | `timezone=UTC` in the URL, `--default-time-zone=+00:00` in MySQL, `TZ=UTC` in the process; `shared/time.js` renders |
| Cross-table rules enforced transactionally and tested | ✅ | `assertValidAssignee`; verified by test |

## 13. Attachment security

| Requirement | Status | Evidence |
|---|---|---|
| PDF, JPEG, PNG only | ✅ | Verified by test — `attachments.test.js`, `unit/fileType.test.js` |
| 10 MB per file | ✅ | Verified by test — "rejects a file larger than 10 MB" |
| 5 per request | ✅ | Verified by test — 2 cases including the running total |
| MIME **and** signature validated | ✅ | Verified by test — spoofing, executable, and web-shell cases |
| Browser filename/extension never trusted | ✅ | Verified by test — "never uses the uploaded filename as the storage path" |
| UUID storage key | ✅ | `buildStorageKey` → `yyyy/mm/<uuid>.<ext>` |
| Path traversal prevented | ✅ | Verified by test — `sanitizeFileName` cases + adapter boundary check |
| Stored outside the web root | ✅ | Verified by inspection — named Docker volume, no nginx location points at it |
| Every download authorised | ✅ | Verified by test — 5 cases (owner, other citizen, anonymous, out-of-scope staff, in-scope staff) |
| Malware-scanning adapter interface | ✅ | `infra/scanner/*` with a fail-closed contract |
| Quarantine until scanned | ✅ | `Attachment.scanStatus`; verified by test — "refuses a quarantined file to everyone" |
| Streaming where possible | ✅ | Downloads stream via `pipeline`; uploads are buffered to bound memory at 10 MB and to avoid temp files |
| Temp files removed on failure | ✅ | `scanAndStore` returns a `rollback` the caller invokes; verified by test — rollback case |
| No filesystem paths in responses | ✅ | Verified by test — "does not expose storage keys or filesystem paths" |
| Local and S3 adapters | ✅ | `localStorageAdapter.js`, `s3StorageAdapter.js` |

## 14–15. API and response format

| Requirement | Status | Evidence |
|---|---|---|
| All 22 specified endpoints under `/api/v1` | ✅ | `docs/06-api.md`; `src/routes/index.js` |
| Pagination, filtering, sorting, validation, authn, authz | ✅ | `requests.schemas.js`, `utils/pagination.js`, route guards + service assertions |
| OpenAPI documentation | ✅ | `src/docs/openapi.js`, served at `/api/docs` |
| Exact success and error envelopes | ✅ | `utils/respond.js`; asserted throughout the integration suites |
| Correct HTTP status codes | ✅ | Verified by test across all suites |
| No stack traces, SQL, Prisma errors, secrets, hashes or paths in responses | ✅ | `middleware/errorHandler.js`; verified by test — `idempotency.test.js` "gives up cleanly when every retry collides" |
| Correlation id | ✅ | `middleware/requestId.js`; present in every error body and `X-Request-Id` |
| Structured server-side logging | ✅ | Pino with redaction |

## 16. General security

| Requirement | Status | Evidence |
|---|---|---|
| Helmet with a CSP | ✅ | `app.js` — `default-src 'none'` for the JSON API |
| Strict CORS allowlist, no wildcard | ✅ | `app.js`; production refuses plain-http origins |
| CSRF on cookie-authenticated mutations | ✅ | Verified by test |
| Request size limits | ✅ | 100 kb JSON, Multer part/field caps |
| OTP, login, tracking, upload rate limits | ✅ | `middleware/rateLimit.js`; Redis-backed so limits hold across replicas |
| Zod validation | ✅ | Every route with a body, query or param |
| Output field allowlisting | ✅ | `utils/serializers.js` — nothing is built by spreading a row |
| Parameterised queries | ✅ | Prisma only; the two `$executeRawUnsafe` calls are in test-only truncation with a fixed table list |
| XSS protection | ✅ | React escapes by default; the single `dangerouslySetInnerHTML` is locally generated QR SVG |
| HPP protection | ✅ | `middleware/hpp.js` |
| Secure cookies in production | ✅ | Forced regardless of the env var |
| Environment validation on startup | ✅ | `config/env.js` fails closed |
| Secret redaction from logs | ✅ | Pino `redact` list |
| Mass-assignment protection | ✅ | `.strict()` on every schema; verified by test |
| Authorisation at route **and** service layer | ✅ | `requireStaff(...)` + `assert*` in services |
| Dependency audit instructions | ✅ | `npm run audit:deps`; `docs/08-deployment.md` §7 |
| No hard-coded secrets | ✅ | Verified by inspection — every secret comes from `config` |
| No sensitive information in Git | ✅ | `.gitignore` excludes `.env`, `var/`, uploads |
| Safe shutdown with connection cleanup | ✅ | `server.js` — drain, then Prisma and Redis disconnect, with a forced exit backstop |
| `.env.example` with placeholders only | ✅ | Root `.env.example` |

## 17. Admin dashboard

| Requirement | Status | Evidence |
|---|---|---|
| Secure login | ✅ | `screens/Login.jsx` |
| Role-aware navigation | ✅ | `App.jsx`, `permissions` from `/auth/staff/me` |
| Server-side pagination | ✅ | `RequestsList.jsx` + `Pagination` |
| Filters (status, department, section, assignee, service, date) | ✅ | `RequestsList.jsx`; the API intersects them with scope |
| Request details | ✅ | `RequestDetails.jsx` |
| Assignment and reassignment controls | ✅ | `RequestDetails.jsx`, drawn only when `permissions.canAssign` |
| Status control showing only valid transitions | ✅ | Populated from `allowedTransitions` returned by the API |
| Internal-note and citizen-reply forms | ✅ | `RequestDetails.jsx` |
| Attachment access | ✅ | Authorised streaming endpoint |
| Timeline | ✅ | Visibility badges distinguish internal from citizen-visible |
| Manager and section-head analytics | ✅ | `Analytics.jsx`, scope from the caller's role |
| Arabic and English | ✅ | `i18n/ar.json`, `i18n/en.json` |
| Loading, empty, success, error states | ✅ | `Spinner`, `EmptyState`, `ErrorPanel` on every screen |
| Frontend checks are not the only authorisation | ✅ | Verified by test — `rbac.test.js` calls the API directly |

## 18. Testing

| Required coverage | Status | Test |
|---|---|---|
| OTP generation and hashing | ✅ | `unit/otp.test.js` |
| OTP expiration | ✅ | `integration/citizenAuth.test.js` |
| OTP cooldown and attempt limit | ✅ | `integration/citizenAuth.test.js` |
| Authentication rate limiting | ✅ | `integration/citizenAuth.test.js`, `integration/tracking.test.js` |
| Citizen session idle expiration | ✅ | `integration/session.test.js` |
| Staff login and disabled-staff rejection | ✅ | `integration/staffAuth.test.js` |
| Citizen ownership enforcement | ✅ | `integration/requests.test.js`, `integration/attachments.test.js` |
| RBAC for all three roles | ✅ | `integration/rbac.test.js`, `unit/policies.test.js` |
| Cross-department access denial | ✅ | `integration/rbac.test.js` |
| Cross-section assignment denial | ✅ | `integration/rbac.test.js` |
| Status-transition rules | ✅ | `unit/statusMatrix.test.js`, `integration/requests.test.js` |
| Internal-note privacy | ✅ | `integration/notePrivacy.test.js` |
| Public tracking privacy | ✅ | `integration/tracking.test.js` |
| Reference-number collision retry | ✅ | `integration/idempotency.test.js` |
| Idempotent submission | ✅ | `integration/idempotency.test.js` |
| Transaction rollback | ✅ | `integration/idempotency.test.js` |
| MIME spoofing and invalid attachments | ✅ | `unit/fileType.test.js`, `integration/attachments.test.js` |
| File-size and count limits | ✅ | `integration/attachments.test.js` |
| Isolated test database | ✅ | `tests/setup/db.js` refuses any database not ending in `_test` |
| No real SMS | ✅ | `NODE_ENV=test` pins the in-memory mock provider |

## 19. DevOps and documentation

| Requirement | Status | Evidence |
|---|---|---|
| Dockerfiles for all applications | ✅ | `docker/api.Dockerfile`, `kiosk.Dockerfile`, `admin.Dockerfile` |
| Compose for MySQL, Redis, API, kiosk, admin | ✅ | `docker-compose.yml` (+ optional ClamAV profile) |
| Prisma migrations | ✅ | `apps/api/prisma/migrations/20260101000000_init` — applied successfully against MySQL 8.4 |
| Seed script | ✅ | `apps/api/prisma/seed.js`, refuses to run in production |
| Health and readiness endpoints | ✅ | `/health`, `/ready` |
| `.env.example` | ✅ | Root |
| README, dev and production instructions, backup guidance, security assumptions, API docs, example requests | ✅ | `README.md`, `docs/08-deployment.md`, `docs/07-security.md`, `docs/06-api.md`, `docs/examples/requests.http` |
| Dev accounts clearly marked development-only | ✅ | Seed banner, README, deployment doc |
| `npm install` / `docker compose up -d` / `prisma:migrate` / `prisma:seed` / `dev` / `test` / `lint` | ✅ | Root `package.json` |

## Verification actually performed

| Check | Result |
|---|---|
| `npm install` across all workspaces | Succeeded |
| `npm audit --omit=dev --audit-level=high` | **0 high, 0 critical** in production dependencies |
| `node --check` on every authored `.js` file | Clean |
| `npm run lint` | **0 errors, 0 warnings** |
| `npx prisma generate` | Client generated |
| `prisma migrate deploy` against MySQL 8.4 | Hand-written migration applied successfully |
| `prisma migrate dev` | Reports "already in sync" — the migration matches the schema exactly |
| `npm run prisma:seed` | 3 departments, 4 sections, 6 services, 13 staff accounts |
| `npm test` (unit only) | 106 passed |
| `npm test` (with `TEST_DATABASE_URL` + `TEST_REDIS_URL`) | **234 passed, 15 suites, 0 failed** against real MySQL 8.4 and Redis 7.4 |
| `npm run build` | Both SPAs built (kiosk 91 kB gzip, admin 76 kB gzip) |
| Live API + 37-check end-to-end HTTP smoke test | **37 passed, 0 failed** |
| Kiosk driven in a real browser | Arabic RTL default, English LTR switch, virtual keypad, OTP sign-in, live idle countdown, wizard routing display — all verified |

### Defects found during verification and fixed

Each of these was a real bug caught by actually running the system, not by
reading the code:

1. **Status change wrongly required a note.** `noteVisibility` carried a Zod
   `.default()`, so the "note required when a visibility is given" refinement
   fired on *every* status change, turning legitimate transitions into 400s.
   Caught by `requests.test.js`. Fixed by removing the default and resolving it
   in the service instead.
2. **A malformed upload returned 500 instead of 415.** `file-type` *throws* on a
   truncated container (a bare PNG signature with no IHDR chunk) rather than
   returning `undefined`, and the error escaped as an internal error — on
   precisely the input an attacker would send. Caught by the HTTP smoke test.
   Fixed, and the magic-byte table is now a *cross-check* that must agree with
   the parsed container rather than a fallback that could rescue it.
3. **The first mutation from a fresh browser was always refused.** The CSRF
   cookie is issued on any safe request, but the kiosk's home and sign-in
   screens render from local state, so a citizen's very first API call was a
   POST with no token — a guaranteed 403 on "Send verification code". The test
   harness had masked this by priming the cookie itself. Caught by driving the
   real UI. Both SPA clients now prime the token on demand.
4. **Rate-limit state leaked between tests.** The limiters used an in-memory
   store under `NODE_ENV=test`, which `resetRedis()` could not clear, so one
   suite's exhausted bucket failed the next. Fixed by using the Redis store in
   tests too — which also means the tests exercise the same code path as
   production.
5. **A rate-limited tracking response carried no cache headers**, because the
   limiter ran before `noCache`. A cached 429 on a shared kiosk would keep
   showing an error after the window reopened. Middleware order corrected.
6. **`prisma migrate dev` failed on a clean setup**, because it needs to create
   a shadow database and the application user deliberately lacks that
   privilege. The shadow database is now pre-created in `docker/mysql/init.sql`
   with `SHADOW_DATABASE_URL` pointing at it, and first-run setup is documented
   as `prisma:deploy` rather than `prisma:migrate`.

## Known gaps, stated plainly

1. **Staff MFA is not implemented.** It is the top recommended follow-up
   (`docs/07-security.md`, T9) and is deliberately out of v1 scope.
2. **Malware scanning is off in development.** Production refuses to boot without
   it, but a developer running locally has no scanning.
3. **Civil ID is not collected** by the kiosk in v1; the encrypted columns exist
   for a future back-office import (`docs/01-assumptions.md`, B5).
4. **Terminal requests cannot be reopened.** The specification declares them
   terminal and defers a reopening workflow; no such endpoint exists.
5. **Integration tests require Docker.** Without `TEST_DATABASE_URL` and
   `TEST_REDIS_URL` they skip with a printed notice rather than failing.
6. **Load and penetration testing have not been performed.** The rate limits are
   reasoned, not measured against real kiosk traffic.
