# 02 — High-Level Architecture

## Layers

```
Kiosk browser (React/Vite)  ─┐
Staff browser (React/Vite)  ─┤──► Reverse proxy (TLS) ──► Express API ──► Prisma ──► MySQL 8
Public tracking (no auth)   ─┘                              │
                                                            ├──► Redis (sessions, OTP, rate limits, idempotency)
                                                            ├──► Storage adapter (local FS | S3-compatible)
                                                            ├──► SMS adapter (mock | HTTP provider)
                                                            └──► Scanner adapter (noop | ClamAV)
```

The API is the only component that talks to a datastore. Both React apps are static
bundles; they hold **no** secrets and **no** tokens — every credential lives in an
`HttpOnly` cookie the JavaScript cannot read.

## Backend module anatomy

Every feature module is the same five files, so authorisation can never be "forgotten in
one place":

```
modules/<feature>/
  <feature>.routes.js       Express wiring only: middleware chain + controller reference
  <feature>.controller.js   HTTP in / HTTP out. No business rules, no Prisma.
  <feature>.service.js      Business rules, transactions, authorisation decisions.
  <feature>.repository.js   The only file allowed to touch `prisma`.
  <feature>.schemas.js      Zod schemas for params / query / body.
```

Rule: **inside `src/modules`, the Prisma client is imported only by
`*.repository.js`.** Controllers never import a repository, and no service in a
feature module touches Prisma.

Three files outside `src/modules` also use the client directly, deliberately:

| File | Why |
|---|---|
| `auth/citizenSession.js`, `auth/staffSession.js` | Session storage is infrastructure, not a feature. Routing it through a feature repository would make every module depend on the auth module. |
| `auth/requireCitizen.js`, `auth/requireStaff.js` | Load the actor on each request, before any module is reached. |
| `utils/audit.js` | The audit writer must work even for identifiers that belong to no module — a failed login against a username that does not exist. |

Verify with:

```bash
grep -rln "infra/prisma" apps/api/src/modules
```

which should list only `*.repository.js` files plus `health.service.js` (that one
imports the `pingDatabase` health helper, not the client).

## Authorisation is applied twice, deliberately

1. **Route layer** — `requireStaff(...roles)` rejects a caller whose role could never
   perform the operation. Cheap, coarse, fails before any query.
2. **Service layer** — `assertCanViewRequest`, `assertCanUpdateStatus`,
   `assertCanAssign` re-derive the decision *from the loaded row* (its
   `departmentId` / `sectionId` / `assignedTo`) against the caller's scope.

Step 2 is the real control. Step 1 exists so that a bug in step 1 is not a breach and a
bug in step 2 is not reachable by an obviously-wrong role. The frontend hides buttons
purely for ergonomics; it is never consulted.

## Architecture diagram

```mermaid
flowchart TB
  subgraph Public["Public terminals & devices"]
    K["Kiosk SPA<br/>React + Vite (ar/en, RTL)"]
    P["Public tracking page<br/>no authentication"]
  end
  subgraph Internal["Municipality network"]
    A["Admin SPA<br/>React + Vite"]
  end

  RP["Reverse proxy<br/>TLS, HSTS, real client IP"]

  K --> RP
  P --> RP
  A --> RP

  subgraph API["Express API — apps/api"]
    MW["Edge middleware<br/>helmet · cors allowlist · hpp<br/>body limits · requestId · pino-http"]
    RL["Rate limiters (Redis store)<br/>otp · login · tracking · upload · global"]
    AUTH["Auth middleware<br/>citizen session · staff session · CSRF"]
    RT["Routers /api/v1"]
    CTL["Controllers (thin)"]
    SVC["Services — business rules, RBAC, transactions"]
    REPO["Repositories — sole Prisma consumers"]
    ERR["Error handler<br/>safe codes, correlation id, redaction"]
  end

  RP --> MW --> RL --> AUTH --> RT --> CTL --> SVC --> REPO
  SVC -.throws.-> ERR

  REPO --> DB[("MySQL 8<br/>Prisma")]
  AUTH --> R[("Redis<br/>sessions · OTP · limits · idempotency")]
  SVC --> R
  SVC --> ST["Storage adapter<br/>local ⇄ S3"]
  SVC --> SMS["SMS adapter<br/>mock ⇄ HTTP provider"]
  SVC --> SC["Scanner adapter<br/>noop ⇄ ClamAV"]
  ST --> FS[("Uploads volume<br/>outside web root")]
```

## Request-submission flow

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen (kiosk)
  participant K as Kiosk SPA
  participant A as API
  participant R as Redis
  participant D as MySQL
  participant S as Storage
  participant V as Scanner

  C->>K: choose service, fill title/description, attach files
  K->>A: POST /citizen/requests (multipart, cookie + X-CSRF-Token + Idempotency-Key)
  A->>A: CSRF check → citizen session → sliding idle check
  A->>R: GET idem:<citizenId>:<key>
  alt key already used
    R-->>A: cached referenceNumber
    A-->>K: 200 { referenceNumber }  (no second request created)
  else first submission
    A->>A: Multer memory buffers → magic-byte check → size/count caps
    A->>D: load MunicipalService (isActive)
    Note over A: departmentId / sectionId derived from the SERVICE row,<br/>never from the request body
    A->>V: scan each buffer (adapter)
    V-->>A: CLEAN / INFECTED
    A->>S: put(uuid storage key) for each clean file
    A->>D: TRANSACTION
    Note over A,D: generate DHO-YYYY-XXXXXX (crypto) →<br/>insert Request → insert Attachments →<br/>insert RequestLog(CREATED, CITIZEN_VISIBLE)<br/>retry ≤5× on referenceNumber collision
    D-->>A: committed
    A->>R: SETEX idem key → referenceNumber (24h)
    A-->>K: 201 { referenceNumber, status: PENDING }
  end
  Note over A,S: if the transaction rolls back, every stored object is deleted
  K-->>C: reference number + QR of the public tracking URL
```

## Citizen idle-expiry flow

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen
  participant K as Kiosk SPA
  participant A as API
  participant R as Redis

  C->>K: interacts
  K->>A: any authenticated call (cookie)
  A->>R: GET sess:citizen:<sid>
  alt now - lastSeenAt > 120s  OR  now > absoluteExpiresAt
    A->>R: DEL sess:citizen:<sid>
    A->>A: revoke CitizenSession row (revokedAt)
    A-->>K: 401 SESSION_EXPIRED + clear cookies
    K->>K: purge React state, cancel queries, clear caches, replace() to /
  else still valid
    A->>R: lastSeenAt = now  (slide only, absolute cap untouched)
    A-->>K: 200
  end
  Note over K: a local timer only draws the 30s warning modal.<br/>The server decides. A frozen timer changes nothing.
```
