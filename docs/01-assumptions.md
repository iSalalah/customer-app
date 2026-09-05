# 01 — Assumptions and Resolved Decisions

The specification contained a small number of genuine gaps and one soft contradiction.
Each is resolved below. No business rule from the specification was changed.

## A. Contradictions resolved

### A1. "JWT **or** secure opaque sessions" vs. server-enforced 2-minute idle timeout
The specification requires (§6) that citizen idle expiry be **enforced on the server**
and that sessions be **invalidated** on expiry and on logout. A stateless JWT cannot be
invalidated or slid server-side without a server-side store, so a JWT would have to be
backed by a Redis allowlist anyway.

**Decision:** use **opaque session tokens** (256-bit, `crypto.randomBytes`) delivered in
`HttpOnly` cookies. State lives in Redis (hot path: idle clock, revocation) and MySQL
(`CitizenSession` / `StaffSession`, hashed token, audit trail). This satisfies both
options offered by the specification and is the only one that satisfies §6 and §8.
No JWT library is used anywhere.

### A2. "Do not use TypeScript anywhere" vs. Prisma
Prisma generates `.d.ts` files inside `node_modules/.prisma`. That is generated
vendor output, not project source. **No file authored by this project is `.ts`/`.tsx`**,
and no TypeScript compiler is part of any build.

## B. Missing decisions — safe defaults chosen

| # | Gap | Decision |
|---|-----|----------|
| B1 | Password hash algorithm not fixed | **Argon2id** (`argon2` native binding), m=19456 KiB, t=2, p=1 (OWASP 2024 minimum). bcrypt is not used. |
| B2 | Staff access/refresh lifetimes | Access session **15 minutes**, refresh session **8 hours** (one municipal shift), refresh token **rotated** on every use with reuse-detection revoking the whole family. |
| B3 | Citizen "sliding" window semantics | Absolute cap **30 minutes**, idle cap **2 minutes**. Idle clock slides on any authenticated request; the absolute cap never slides. |
| B4 | CSRF strategy | Double-submit: a non-`HttpOnly` `dm.csrf` cookie plus an `X-CSRF-Token` header, compared with `timingSafeEqual`. Required on every cookie-authenticated `POST/PATCH/PUT/DELETE`. |
| B5 | Civil ID handling | Kiosk **does not collect** civil ID in v1 (it is not needed for any listed workflow, and collecting it raises the breach blast radius). The columns exist as specified: `civilIdEncrypted` = AES-256-GCM under `CIVIL_ID_ENC_KEY`; `civilIdHash` = HMAC-SHA256 under `CIVIL_ID_PEPPER` for uniqueness lookups. A back-office import can populate them. |
| B6 | Phone normalisation | Oman E.164. Accepts `9xxxxxxx`, `7xxxxxxx`, `0096891234567`, `+968 9123 4567`; stores `+9689xxxxxxx`. Non-Oman numbers are rejected. |
| B7 | Malware scanning + `Attachment` shape | §13 requires quarantine-until-scanned, but §12's `Attachment` field list has no scan column. The list is prefixed "**at least**", so `scanStatus` + `scannedAt` are **added**. With `MALWARE_SCAN_ENABLED=false` (dev default) rows are written `CLEAN` immediately. |
| B8 | Attachments on a `NEED_INFO` reply | Citizens may attach files with a reply, counted against the same **5 per request** ceiling. |
| B9 | Who may reopen `APPROVED`/`REJECTED` | Nobody. Terminal is terminal (§10). No reopen endpoint exists; the transition table is the single source of truth. |
| B10 | Analytics scope | `GET /staff/analytics/summary` returns a scope derived **from the caller's own role**, never from a query parameter: MANAGER → department, SECTION_HEAD → section, EMPLOYEE → own assignments. |
| B11 | Kiosk print | Kiosks print via `window.print()` against a print-only stylesheet, plus an on-screen QR of the public tracking URL. No native print driver integration. |
| B12 | Public tracking status labels | The public endpoint returns a **coarsened** label set (`RECEIVED` / `UNDER_REVIEW` / `ACTION_REQUIRED` / `CLOSED`) so that internal workflow granularity is not leaked to an unauthenticated enumerator. |
| B13 | Timezone | All storage is UTC (`DATETIME(3)`, driver in UTC). `Asia/Muscat` (UTC+4, no DST) is applied only at render time via `Intl.DateTimeFormat`. |
| B14 | Kiosk identity | Kiosks are unauthenticated public terminals; `KIOSK_ID` is a non-secret header used for logging only and grants nothing. |
| B15 | Node runtime | **Node.js 20 LTS**. `package.json` sets `"engines": { "node": ">=20.11 <23" }`. |

## C. Security assumptions about the deployment

1. TLS terminates at a reverse proxy in front of the API; `TRUST_PROXY` is set so that
   `req.ip` used by rate limiters is the real client address.
2. Kiosks sit on a managed municipal network in kiosk-mode browsers. The browser
   chrome (address bar, devtools, file picker beyond the upload control) is locked down
   by the kiosk OS image — the application does not attempt to enforce that itself.
3. MySQL and Redis are never exposed publicly; in `docker-compose.yml` their ports are
   published only for local development.
4. Uploaded files live outside any web root and are streamed back only through an
   authorising controller. There is no static file server pointed at the upload dir.
5. Seeded development accounts exist **only** when `NODE_ENV !== 'production'`; the seed
   script hard-refuses to run against production.
