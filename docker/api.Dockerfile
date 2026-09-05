# syntax=docker/dockerfile:1

# ---- Build stage ------------------------------------------------------------
# Dependencies are installed here (argon2 needs a toolchain to build) and the
# Prisma client is generated, so the runtime image needs no compiler.
FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Only the manifests first, so a source change does not invalidate the
# dependency layer.
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN npm install --workspace @dhofar/api --workspace @dhofar/shared --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN npm run prisma:generate --workspace @dhofar/api

# ---- Runtime stage ----------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

# openssl is required by the Prisma query engine; tini gives correct signal
# handling so the graceful shutdown in server.js actually runs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=UTC \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api

# Uploads live on a mounted volume, outside any web root, owned by the app user.
RUN mkdir -p /app/apps/api/var/uploads \
    && chown -R node:node /app/apps/api/var

USER node

EXPOSE 4000

# Readiness is what the orchestrator should gate traffic on: it proves MySQL and
# Redis are reachable, not merely that the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
