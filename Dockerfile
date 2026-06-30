# ── base ──────────────────────────────────────────────────────────────
# Node 25 — Prisma 7.6+ @prisma/studio-core declares `>=24.0` (covers 25).
FROM node:25-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Harden npm against transient network failures (ECONNRESET, timeouts)
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY . .
RUN mkdir -p public
# prisma generate needs DATABASE_URL in config; placeholder suffices (no DB connection)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# better-auth builds its instance at module load during `next build`. The real
# secret is read at runtime (env_file), so a build-time placeholder just avoids
# the default-secret error during prerendering; it is not used at runtime.
ENV BETTER_AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
# NEXT_PUBLIC_* are embedded in client bundle at build time (not secrets).
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_GTM_ID=
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL=
ARG NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_GTM_ID=${NEXT_PUBLIC_GTM_ID}
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID}
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=${NEXT_PUBLIC_UMAMI_SCRIPT_URL}
ENV NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=${NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
# Server Actions need a stable encryption key at build time. Pass via secret mount (not ARG/ENV).
# Build with: --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN npx prisma generate
RUN --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    npm run build

# ── runner ────────────────────────────────────────────────────────────
# Minimal app image: Next.js standalone only. No prisma/node_modules.
# Migrate and seed run in the init container.
FROM node:25-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Healthcheck in docker-compose.yml uses wget; slim node image does not include it.
RUN apk add --no-cache wget

# Keep the runtime UID/GID stable so the shared uploads volume can be
# prepared by the init container with matching ownership.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

# ── init ─────────────────────────────────────────────────────────────
# Runs migrate on deploy (seed remains manual). Uses full node_modules (no cherry-picking).
# Creates upload subdirs so web (nextjs user) can write. Depends on init completing before web starts.
FROM builder AS init
WORKDIR /app
CMD ["sh", "-c", "mkdir -p /app/uploads/banner /app/uploads/avatar /app/uploads/vendor /app/uploads/event /app/uploads/market /app/uploads/photos /app/uploads/backups && chown -R 1001:1001 /app/uploads && chmod -R 775 /app/uploads && npx prisma migrate deploy"]
