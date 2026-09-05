# syntax=docker/dockerfile:1

# ---- Build stage ------------------------------------------------------------
FROM node:20-bookworm-slim AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:4000/api/v1
ARG VITE_DEFAULT_LOCALE=ar

# Vite inlines these at build time, so they must be present now, not at runtime.
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_DEFAULT_LOCALE=$VITE_DEFAULT_LOCALE

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/admin/package.json ./apps/admin/

RUN npm install --workspace @dhofar/admin --workspace @dhofar/shared --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/admin ./apps/admin

RUN npm run build --workspace @dhofar/admin

# ---- Runtime stage ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
