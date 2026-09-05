# 03 — RBAC Permission Matrix

Scope vocabulary:
- **own** — `request.assignedTo === staff.id`
- **section** — `request.sectionId === staff.sectionId`
- **department** — `request.departmentId === staff.departmentId`

A `null` `sectionId` on the staff row means the staff member has no section scope; a
`SECTION_HEAD` or `EMPLOYEE` without a `sectionId` is a configuration error and is
rejected at login-scope build time.

## Staff matrix

| Capability | EMPLOYEE | SECTION_HEAD | MANAGER |
|---|---|---|---|
| List requests | own only | section | department |
| View request detail | own only | section | department |
| View internal notes / full timeline | own only | section | department |
| Download attachment | own only | section | department |
| Add internal note (`INTERNAL`) | own only | section | department |
| Add citizen-visible reply (`CITIZEN_VISIBLE`) | own only | section | department |
| Change status | own only | section | department |
| Assign / reassign | ✗ | to active staff **in own section** | to active staff **in own department** (must match the request's section when the request has one) |
| Analytics summary | own assignments | own section | own department |
| Cross-department anything | ✗ | ✗ | ✗ |
| Cross-section assignment | ✗ | ✗ | ✗ (assignee's section must equal the request's section) |
| Reopen a terminal request | ✗ | ✗ | ✗ |

## Citizen matrix

| Capability | Anonymous | Authenticated citizen |
|---|---|---|
| Browse departments / active services | ✓ | ✓ |
| Public tracking by reference (coarse status only) | ✓ (rate limited) | ✓ |
| Create a request | ✗ | ✓ |
| List **own** requests | ✗ | ✓ |
| View **own** request detail | ✗ | ✓ |
| See `CITIZEN_VISIBLE` timeline entries | ✗ | ✓ |
| See `INTERNAL` notes | ✗ | **✗ — never** |
| See staff identity / assignee | ✗ | **✗ — never** |
| Download **own** attachments | ✗ | ✓ |
| Reply when status is `NEED_INFO` | ✗ | ✓ (only in `NEED_INFO`) |
| Any `/staff/*` endpoint | ✗ | ✗ (403 `FORBIDDEN`) |

## Enforcement points

| Rule | Route guard | Service assertion | Test |
|---|---|---|---|
| Role can never reach the endpoint | `requireStaff('MANAGER','SECTION_HEAD')` | — | `rbac.staff.test.js` |
| Row is inside caller scope | — | `assertCanViewRequest` | `rbac.scope.test.js` |
| Status change allowed for caller | — | `assertCanUpdateStatus` | `status.transitions.test.js` |
| Assignee is active, same department, same section | — | `assertValidAssignee` | `assignment.test.js` |
| Citizen owns the request | `requireCitizen` | `assertCitizenOwnsRequest` | `citizen.ownership.test.js` |
| Internal notes never serialised to a citizen | — | `toCitizenRequestDetail` allowlist | `note.privacy.test.js` |
| Disabled staff cannot authenticate or be assigned | — | `isActive` checks in both paths | `staff.auth.test.js` |
