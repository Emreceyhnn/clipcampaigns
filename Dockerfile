# syntax=docker/dockerfile:1.7

# ---- deps -------------------------------------------------------------------
# Install dependencies separately so a source-only change doesn't reinstall them.
FROM node:22-alpine AS deps
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.25.0

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# The build only needs DATABASE_URL to satisfy the connection-string check in
# src/server/db/index.ts at import time; no query runs during the build. The
# real URL is supplied at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

RUN pnpm build

# ---- runner -----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run as an unprivileged user rather than root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# standalone already contains the traced production node_modules and server.js.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next's trace only pulls in what the app itself imports at runtime, so the
# migration path (tsx + drizzle's migrator) gets its own isolated install in
# a separate folder rather than mixing npm into the standalone output's
# pnpm-linked node_modules (the two package managers lay out node_modules
# differently and corrupt each other's tree if merged).
COPY --chown=nextjs:nodejs drizzle ./drizzle
COPY --chown=nextjs:nodejs src/scripts/migrate.ts ./migrate/migrate.ts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN cd ./migrate \
 && npm init -y >/dev/null \
 && npm install --no-save tsx@4 drizzle-orm@0.45.2 postgres@3.4.9 dotenv@17.4.2 \
 && chmod +x ../docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# No extra tooling in the image: probe with the node binary that is already here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENV MIGRATIONS_FOLDER=/app/drizzle

# Applies pending migrations, then hands off to Next as PID 1 so it still
# receives SIGTERM directly for a clean shutdown.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
