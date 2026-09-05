# 08 — Development and Deployment

## Prerequisites

- Node.js 20 LTS (`>=20.11 <23`) and npm 10
- Docker Engine 24+ with Compose v2
- Build toolchain for the `argon2` native module when installing outside Docker:
  - Debian/Ubuntu: `build-essential python3`
  - macOS: Xcode command line tools
  - Windows: `npm install --global windows-build-tools`, or use the Docker path

## First run

```bash
cp .env.example .env
```

Generate four distinct secrets and paste them into `.env`:

```bash
node -e "for (const k of ['OTP_PEPPER','CIVIL_ID_PEPPER','CIVIL_ID_ENC_KEY','SESSION_SECRET']) console.log(k + '=' + require('crypto').randomBytes(32).toString('base64url'))"
```

Set `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` to values of your own, then:

```bash
npm install
```

```bash
docker compose up -d mysql redis
```

The initial migration is already committed, so first-time setup only needs to
apply it:

```bash
npm run prisma:deploy
```

```bash
npm run prisma:seed
```

```bash
npm run dev
```

> **`prisma:migrate` vs `prisma:deploy`.** `npm run prisma:deploy` applies the
> committed migrations and is what both first-time setup and production use.
> `npm run prisma:migrate` (`prisma migrate dev`) is for *authoring* a new
> migration after a schema change; it needs a scratch "shadow" database, which
> `docker/mysql/init.sql` pre-creates and `SHADOW_DATABASE_URL` points at. That
> indirection exists so the application user never needs the `CREATE DATABASE`
> privilege.

| Surface | URL |
|---|---|
| Citizen kiosk | http://localhost:5173 |
| Staff dashboard | http://localhost:5174 |
| API | http://localhost:4000/api/v1 |
| API explorer | http://localhost:4000/api/docs |
| Health / readiness | http://localhost:4000/api/v1/health, `/ready` |

### Signing in during development

Staff accounts come from the seed and are printed by it. Every seeded account
uses the password `Dhofar#Dev2026`. They exist **only** when `NODE_ENV` is not
`production`; the seed script exits with an error if it is.

| Username | Role | Scope |
|---|---|---|
| `manager.planning` | MANAGER | Urban Planning |
| `head.permits` | SECTION_HEAD | Urban Planning / Building Permits |
| `emp.permits1` | EMPLOYEE | Urban Planning / Building Permits |
| `manager.environment` | MANAGER | Health and Environment |
| `head.inspection` | SECTION_HEAD | Health and Environment / Health Inspection |
| `manager.services` | MANAGER | Municipal Services |
| `emp.disabled` | EMPLOYEE (disabled) | exercises the disabled-account path |

Citizens are created on their first successful OTP verification — there is no
citizen seed. With `SMS_DRIVER=mock` and `NODE_ENV=development` the code is
printed to the API console, prefixed `[DEV SMS]`. It is never printed in any
other environment and never returned by the API.

## Running the whole stack in Docker

```bash
docker compose up -d --build
```

Then apply migrations inside the API container:

```bash
docker compose exec api npx prisma migrate deploy
```

```bash
docker compose exec api node prisma/seed.js
```

## Running the tests

Unit tests need nothing:

```bash
npm test
```

Integration tests need MySQL and Redis, and refuse to run against a database
whose name does not end in `_test`:

```bash
docker compose up -d mysql redis
```

```bash
TEST_DATABASE_URL="mysql://dhofar:YOUR_PASSWORD@localhost:3306/dhofar_portal_test?timezone=UTC" TEST_REDIS_URL="redis://localhost:6379/1" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

```bash
TEST_DATABASE_URL="mysql://dhofar:YOUR_PASSWORD@localhost:3306/dhofar_portal_test?timezone=UTC" TEST_REDIS_URL="redis://localhost:6379/1" npm test
```

Without those two variables the integration suites **skip** with a printed
notice and the unit suites still run. No test ever sends an SMS: `NODE_ENV=test`
pins the provider to the in-memory mock.

## Production deployment

### 1. Environment

`config/env.js` fails closed. With `NODE_ENV=production` the process refuses to
start unless all of the following hold:

- No secret contains `CHANGE_ME`, `example`, `placeholder` or `test`.
- `OTP_PEPPER`, `CIVIL_ID_PEPPER`, `CIVIL_ID_ENC_KEY` and `SESSION_SECRET` are
  all distinct and at least 32 characters (`CIVIL_ID_ENC_KEY` must decode to
  exactly 32 bytes).
- `CORS_ALLOWED_ORIGINS` is non-empty and contains only `https://` origins.
- `SMS_DRIVER` is not `mock`.
- `MALWARE_SCAN_ENABLED=true` (and therefore `MALWARE_SCANNER_DRIVER=clamav`).
- `SWAGGER_ENABLED=false`.

`COOKIE_SECURE` is forced to `true` in production regardless of the variable.

### 2. Reverse proxy

TLS terminates ahead of the API. Set `TRUST_PROXY` to the number of proxies in
front, or rate limiting will see only the proxy address and become a single
shared bucket for the whole country.

Required forwarded headers: `X-Forwarded-For`, `X-Forwarded-Proto`.

Recommended proxy-level headers (the SPA containers already set their own):
`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`.

### 3. Storage

Switch to object storage:

```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://…
S3_BUCKET=dhofar-portal-attachments
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

The bucket must be **private**. The application never issues a pre-signed URL —
every download passes through an authorising controller — so a public bucket
would silently bypass the entire attachment access model.

### 4. Malware scanning

```bash
docker compose --profile scanning up -d clamav
```

Set `MALWARE_SCAN_ENABLED=true` and `MALWARE_SCANNER_DRIVER=clamav`. The scanner
adapter **fails closed**: if clamd is unreachable, uploads are rejected rather
than accepted unscanned.

### 5. Migrations

Never run `prisma migrate dev` against production. Deployment order:

1. Back up (below).
2. `npx prisma migrate deploy` — applies pending migrations only, never resets.
3. Roll out the new API image.
4. Roll out the SPA images.

The schema contains no destructive column drops, so a forward-only rollout is
safe with one API version overlap.

### 6. Backups

```bash
docker compose exec mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers dhofar_portal | gzip > backup-$(date +%F).sql.gz
```

Restore:

```bash
gunzip -c backup-2026-09-05.sql.gz | docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" dhofar_portal
```

Notes:

- `--single-transaction` gives a consistent snapshot without locking writers.
- **Attachments are not in the database.** Back up the object store or the
  uploads volume separately, or a restore will produce rows pointing at files
  that no longer exist.
- Redis needs no backup: everything in it is either reconstructible from MySQL
  (sessions) or intentionally ephemeral (OTP counters, rate limits).
- Test the restore path on a staging database. An untested backup is a guess.

### 7. Dependency auditing

```bash
npm run audit:deps
```

Run it in CI and before each release. It checks production dependencies at the
`high` level; treat any finding in `argon2`, `multer`, `express` or `@prisma/*`
as release-blocking.

### 8. Kiosk hardening (operations, not application)

The application cannot enforce these; they belong to the kiosk OS image:

- Browser in kiosk mode: no address bar, no devtools, no file:// access.
- Disable USB mass storage and the on-screen browser download manager.
- Auto-reload the kiosk URL on idle at the OS level as a second line of defence
  behind the two-minute application timeout.
- Physically secure the machine; disable BIOS boot from external media.
- Keep the kiosks on a segmented VLAN that can reach only the API origin.

## Operational runbook

| Symptom | First check |
|---|---|
| `/ready` returns 503 | `docker compose ps`; the body names which dependency is down |
| Citizens report instant sign-outs | Clock skew between API replicas; the idle window is absolute time |
| Every request rate limited | `TRUST_PROXY` wrong, so all traffic shares one IP bucket |
| Uploads all rejected | ClamAV unreachable — the scanner fails closed by design |
| Staff signed out every 15 minutes | Refresh cookie path or `SameSite` broken behind the proxy |
| Reference numbers exhausted retries | Genuine collisions are ~1 in 10⁹; check for a stuck clock producing one year |
