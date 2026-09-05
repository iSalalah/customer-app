# Dhofar Municipality — Self-Service Citizen Portal

A production-ready citizen services portal for public touch-screen kiosks, with a
secure web dashboard for municipality staff.

JavaScript only. No TypeScript file is authored anywhere in this repository, and
no TypeScript compiler is part of any build.

---

## What it does

**Citizens**, at a kiosk, sign in with their phone number and a one-time code,
submit a request against a municipal service, attach supporting documents, track
progress, and answer when the municipality asks for more information. Anyone can
check a request's coarse status from its reference number without signing in.

**Staff** work the queue from a dashboard scoped to their role: a manager sees
their department, a section head sees their section, an employee sees only what
is assigned to them. Assignments, status changes, notes and citizen replies all
write an immutable log entry in the same transaction as the change itself.

## The three requirements that shaped the design

1. **A kiosk is a shared terminal.** A citizen session expires after two minutes
   of inactivity, enforced on the server, and every trace is purged from the
   browser when it does. Nothing sensitive is ever written to `localStorage`.
2. **Routing is not the client's decision.** When a citizen picks a service, the
   destination department and section are read from the stored service record.
   `departmentId` and `sectionId` in a request body are rejected outright.
3. **Hiding a button is not a security control.** Every authorisation decision is
   re-derived on the server from the loaded row, in the service layer, on every
   call. The frontend hides controls purely so staff are not offered actions that
   would fail.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 LTS, ES modules |
| API | Express 4, Zod validation, Pino logging |
| Data | MySQL 8 via Prisma 5 |
| State | Redis 7 — sessions, OTP counters, rate limits, idempotency |
| Auth | Opaque session tokens in `HttpOnly` cookies, Argon2id for staff passwords |
| Frontend | React 18 + Vite 5, JavaScript and JSX only |
| Data fetching | TanStack Query, React Router |
| Testing | Jest + Supertest |
| Docs | OpenAPI 3.1 with Swagger UI |
| Infra | Docker Compose — MySQL, Redis, API, kiosk, admin, optional ClamAV |

## Layout

```
apps/api        Express API — feature modules, each routes/controller/service/repository/schemas
apps/kiosk      Citizen kiosk SPA (Arabic default, RTL, 56px touch targets)
apps/admin      Staff dashboard SPA
packages/shared Status matrix, roles, limits, phone and file rules — one source of truth
docker          Dockerfiles, nginx config, MySQL bootstrap
docs            Architecture, RBAC, workflow, database, API, security, deployment
```

## Getting started

```bash
cp .env.example .env
```

Fill in the four secrets (`docs/08-deployment.md` has a one-liner that generates
them), then:

```bash
npm install
```

`npm install` also generates the Prisma client (`postinstall`), so `npm test`
and `npm run build` work straight after a clone. The unit suites run with no
database; the integration suites skip with a printed notice until you set
`TEST_DATABASE_URL` and `TEST_REDIS_URL`.

```bash
docker compose up -d mysql redis
```

```bash
npm run prisma:deploy
```

```bash
npm run prisma:seed
```

```bash
npm run dev
```

- Kiosk — http://localhost:5173
- Staff dashboard — http://localhost:5174
- API explorer — http://localhost:4000/api/docs

Seeded staff accounts are printed by the seed script and all use the password
`Dhofar#Dev2026`. **They are development-only** — the seed refuses to run when
`NODE_ENV=production`.

Citizens are created on first OTP verification. In development the code is
printed to the API console as `[DEV SMS]`; it is never printed in any other
environment and never returned by the API.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | API, kiosk and admin together |
| `npm test` | Unit suites; integration suites when `TEST_DATABASE_URL` and `TEST_REDIS_URL` are set |
| `npm run lint` | ESLint across every workspace |
| `npm run build` | Production bundles for both SPAs |
| `npm run prisma:deploy` | Apply the committed migrations — first-run setup and production |
| `npm run prisma:migrate` | Author a **new** migration after a schema change (needs the shadow database) |
| `npm run prisma:seed` | Seed the development organisation and accounts |
| `npm run audit:deps` | Audit production dependencies at the `high` level |
| `docker compose up -d` | Bring up the whole stack |

## Documentation

**New to this project? Start here:**
[docs/system-profile-ar.html](docs/system-profile-ar.html) — a self-contained
Arabic briefing covering purpose, features, roles, request lifecycle,
architecture, security limits, what still needs completing, and a proposed
evaluation plan with the report expected back. Open it directly in a browser; it
needs no server and loads nothing external.

| Document | Contents |
|---|---|
| [docs/system-profile-ar.html](docs/system-profile-ar.html) | **الملف التعريفي والتقييم الفني** — briefing and evaluation plan for an incoming developer (Arabic) |
| [docs/00-tree.md](docs/00-tree.md) | Full directory tree |
| [docs/01-assumptions.md](docs/01-assumptions.md) | Contradictions resolved and defaults chosen, with reasons |
| [docs/02-architecture.md](docs/02-architecture.md) | Layering and Mermaid flow diagrams |
| [docs/03-rbac.md](docs/03-rbac.md) | Permission matrix and where each rule is enforced |
| [docs/04-workflow.md](docs/04-workflow.md) | Status transition matrix and log actions |
| [docs/05-database.md](docs/05-database.md) | Relationships, indexes, and what Prisma cannot express |
| [docs/06-api.md](docs/06-api.md) | Endpoint reference and error codes |
| [docs/07-security.md](docs/07-security.md) | Threat model with residual risk |
| [docs/08-deployment.md](docs/08-deployment.md) | Development, production, backups, runbook |
| [docs/09-verification-checklist.md](docs/09-verification-checklist.md) | Requirement-by-requirement verification |
| [docs/examples/requests.http](docs/examples/requests.http) | Runnable example requests |

## Security summary

Full analysis in [docs/07-security.md](docs/07-security.md). In brief:

- Sessions are opaque 256-bit tokens in `HttpOnly`, `Secure`, `SameSite=Strict`
  cookies; only a SHA-256 hash is stored server-side.
- OTPs are `crypto.randomInt` six-digit codes stored as HMAC-SHA256 under a
  pepper, valid 5 minutes, 5 attempts, 60-second resend cooldown, capped per
  phone number and per IP.
- Staff passwords use Argon2id (m=19456, t=2, p=1) with a 15-minute lockout after
  five failures and refresh-token rotation with reuse detection.
- Uploads are validated by magic bytes as well as declared MIME, capped at 10 MB
  and 5 files, stored under server-generated UUID keys outside any web root, and
  streamed back only through an authorising controller.
- Public tracking returns four fields, coarsens `APPROVED` and `REJECTED` to one
  label, and is rate limited against enumeration.
- Errors never carry a stack trace, SQL fragment or Prisma message; the detail is
  logged once against a correlation id returned to the caller.

**Not in v1**, and the top recommended follow-up: multi-factor authentication for
staff accounts.

## Known limitations

- Integration tests require Docker; they skip with a printed notice otherwise.
- Malware scanning is off by default in development and mandatory in production.
- Civil ID columns exist and are encrypted, but the kiosk does not collect the
  field in v1 (see `docs/01-assumptions.md`, B5).
- Terminal requests cannot be reopened; adding that needs its own authorised
  workflow, deliberately out of scope.

## Licence

Unlicensed — internal municipality software.
