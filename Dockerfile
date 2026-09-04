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

# Next's trace only covers what the app imports at runtime, so the migration
# path (tsx + drizzle's migrator) gets its own isolated npm install. Mixing it
# into the standalone output's pnpm-linked node_modules corrupts the tree.
COPY --chown=nextjs:nodejs drizzle ./drizzle
COPY --chown=nextjs:nodejs src/scripts/migrate.ts ./migrate/migrate.ts
COPY --chown=nextjs:nodejs src/scripts/seed.ts ./migrate/seed.ts
# The seed imports db and schema through the "@/" alias, mapped by the local
# tsconfig written below.
COPY --chown=nextjs:nodejs src/server/db ./migrate/src/server/db
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN cd ./migrate \
  && npm init -y >/dev/null \
  && npm install --no-save tsx@4 drizzle-orm@0.45.2 postgres@3.4.9 dotenv@17.4.2 \
  && printf '%s\n' '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","baseUrl":".","paths":{"@/*":["./src/*"]}}}' > tsconfig.json \
  && chmod +x ../docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# Probe with the node binary already in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENV MIGRATIONS_FOLDER=/app/drizzle

# Migrates, then execs Next as PID 1 so it receives SIGTERM directly.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
