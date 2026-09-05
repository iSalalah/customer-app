# syntax=docker/dockerfile:1

# ---- Build stage ------------------------------------------------------------
FROM node:20-bookworm-slim AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:4000/api/v1
ARG VITE_DEFAULT_LOCALE=ar
ARG VITE_IDLE_TIMEOUT_SECONDS=120
ARG VITE_IDLE_WARNING_SECONDS=30
ARG VITE_KIOSK_ID=KIOSK-01

# Vite inlines these at build time, so they must be present now, not at runtime.
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_DEFAULT_LOCALE=$VITE_DEFAULT_LOCALE \
    VITE_IDLE_TIMEOUT_SECONDS=$VITE_IDLE_TIMEOUT_SECONDS \
    VITE_IDLE_WARNING_SECONDS=$VITE_IDLE_WARNING_SECONDS \
    VITE_KIOSK_ID=$VITE_KIOSK_ID

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/kiosk/package.json ./apps/kiosk/

RUN npm install --workspace @dhofar/kiosk --workspace @dhofar/shared --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/kiosk ./apps/kiosk

RUN npm run build --workspace @dhofar/kiosk

# ---- Runtime stage ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/kiosk/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
