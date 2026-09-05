# 00 — Monorepo Directory Tree

```
customer-app/
├── package.json                       npm workspaces root, orchestration scripts
├── .env.example                       every variable, safe placeholder values only
├── .gitignore  .editorconfig  .eslintrc.json  .dockerignore
├── docker-compose.yml
├── README.md
│
├── docker/
│   ├── api.Dockerfile
│   ├── kiosk.Dockerfile
│   ├── admin.Dockerfile
│   ├── nginx-spa.conf
│   └── mysql/init.sql
│
├── docs/
│   ├── 00-tree.md  01-assumptions.md  02-architecture.md  03-rbac.md
│   ├── 04-workflow.md  05-database.md  06-api.md  07-security.md
│   ├── 08-deployment.md  09-verification-checklist.md
│   └── examples/requests.http
│
├── packages/shared/                   framework-free, imported by API and both SPAs
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── roles.js                   StaffRole, role scope helpers
│       ├── statuses.js                RequestStatus, STATUS_TRANSITIONS, public labels
│       ├── logs.js                    LogVisibility, LogActorType, RequestLogAction
│       ├── files.js                   MIME allowlist, magic bytes, size/count limits
│       ├── phone.js                   Oman E.164 normalisation + masking
│       ├── limits.js                  OTP / session / rate-limit constants
│       ├── errors.js                  ERROR_CODES
│       ├── reference.js               reference-number alphabet + format regex
│       └── time.js                    UTC storage, Asia/Muscat rendering
│
├── apps/api/
│   ├── package.json  jest.config.js  .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/20260101000000_init/migration.sql
│   │   ├── migrations/migration_lock.toml
│   │   └── seed.js
│   └── src/
│       ├── server.js                  bootstrap, graceful shutdown
│       ├── app.js                     express assembly
│       ├── config/env.js              Zod-validated environment, fails closed
│       ├── config/index.js            derived config object
│       ├── infra/
│       │   ├── prisma.js  redis.js  logger.js
│       │   ├── crypto/{hash.js,encryption.js,password.js,otp.js,reference.js,tokens.js}
│       │   ├── storage/{index.js,localStorageAdapter.js,s3StorageAdapter.js}
│       │   ├── sms/{index.js,mockSmsProvider.js,httpSmsProvider.js}
│       │   └── scanner/{index.js,noopScanner.js,clamavScanner.js}
│       ├── middleware/
│       │   ├── requestId.js  httpLogger.js  noCache.js  hpp.js
│       │   ├── validate.js   csrf.js       rateLimit.js  upload.js
│       │   ├── notFound.js   errorHandler.js
│       ├── auth/
│       │   ├── citizenSession.js  staffSession.js
│       │   ├── requireCitizen.js  requireStaff.js
│       │   └── policies.js            scope assertions used by services
│       ├── utils/
│       │   ├── ApiError.js  respond.js  asyncHandler.js
│       │   ├── pagination.js  serializers.js  audit.js
│       ├── modules/
│       │   ├── health/        health.routes.js · health.controller.js · health.service.js
│       │   ├── catalog/       departments + municipal services (public)
│       │   ├── citizenAuth/   OTP request/verify/resend/logout/me
│       │   ├── staffAuth/     login/refresh/logout/me
│       │   ├── requests/      creation, routing, status, assignment, notes, replies
│       │   ├── attachments/   upload pipeline + authorised streaming download
│       │   ├── tracking/      public minimal status
│       │   └── analytics/     role-scoped summary
│       ├── routes/index.js            /api/v1 composition
│       └── docs/openapi.js            OpenAPI 3.1 document + Swagger UI mount
│   └── tests/
│       ├── setup/{env.js,db.js,app.js,factories.js}
│       ├── unit/{otp.test.js,reference.test.js,statusMatrix.test.js,phone.test.js,fileType.test.js,policies.test.js}
│       └── integration/{citizenAuth,staffAuth,rbac,requests,idempotency,attachments,tracking,notePrivacy,session}.test.js
│
├── apps/kiosk/                        citizen touch application
│   ├── package.json  vite.config.js  index.html  .env.example
│   └── src/
│       ├── main.jsx  App.jsx  router.jsx
│       ├── i18n/{index.js,ar.json,en.json}
│       ├── api/{client.js,queries.js}
│       ├── session/{SessionProvider.jsx,useIdleTimer.js,IdleWarningDialog.jsx,purge.js}
│       ├── components/{TouchButton,TextField,TextArea,VirtualKeyboard,FileTile,
│       │               StatusBadge,Stepper,LanguageSwitch,Screen,Spinner,ErrorPanel,QrCode}
│       ├── screens/{Home,Login,Dashboard,Track,TrackResult,
│       │            wizard/{ServiceStep,DetailsStep,AttachmentsStep,ReviewStep,ReceiptStep},
│       │            RequestDetails,NotFound}
│       └── styles/{base.css,tokens.css,rtl.css,print.css}
│
└── apps/admin/                        municipality staff dashboard
    ├── package.json  vite.config.js  index.html  .env.example
    └── src/
        ├── main.jsx  App.jsx  router.jsx
        ├── i18n/{index.js,ar.json,en.json}
        ├── api/{client.js,queries.js}
        ├── auth/{AuthProvider.jsx,RequireAuth.jsx,permissions.js}
        ├── components/{Layout,DataTable,Pagination,Filters,StatusBadge,
        │               Timeline,NoteForm,AssignmentPanel,StatusPanel,
        │               AttachmentList,StatCard,LanguageSwitch,Empty,ErrorPanel}
        └── screens/{Login,RequestsList,RequestDetails,Analytics,NotFound}
```
