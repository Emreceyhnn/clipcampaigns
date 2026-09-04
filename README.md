# Clip Campaigns

A campaign, submission and payout tracker for creator marketing campaigns.
Admins create campaigns with a budget and a per-1k-views payout rate; creators
submit clips against them; admins approve or reject submissions while the app
keeps spend inside the campaign budget.

## Stack

- Next.js 15 (App Router) + React 19
- tRPC for the API layer, Zod for validation shared between client and server
- Drizzle ORM against Postgres
- shadcn/ui + Tailwind CSS
- Vitest

## Getting started

```bash
docker compose up -d postgres   # local Postgres on :5432
cp .env.example .env
pnpm install
pnpm db:migrate                 # apply migrations
pnpm seed                       # optional sample data
pnpm dev
```

Then open http://localhost:3000.

There is no real auth. The home page has a dev-only user switcher that sets a
`userEmail` cookie, which `src/server/context.ts` resolves against the `users`
table. Visitors with no cookie yet are signed in as the admin.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Standard Next.js commands |
| `pnpm test` | Vitest suite (see below) |
| `pnpm db:migrate` | Applies migrations in `drizzle/` |
| `pnpm seed` | Rebuilds sample campaigns, users and metric history (`--if-empty` to skip when data exists) |
| `pnpm ingest` | Idempotent metrics ingest job; re-running on the same day updates that day's row |

## Tests

```bash
pnpm test
```

The suite mixes pure unit tests with integration tests that run against the
local Postgres instance from `docker compose up -d postgres`, so bring that up
and migrate it first. The integration tests create and clean up their own rows.

## Running the whole stack in Docker

```bash
docker compose up -d --build
```

The app container applies migrations on start, seeds sample data if the
database is empty, then serves a Next.js standalone build as a non-root user.
`DATABASE_URL` is supplied at runtime, never baked into the image. nginx
publishes the app on port 80; the app itself is only reachable on the internal
Docker network.

The seed step is what makes a fresh stack usable immediately: with no rows in
`users`, the dev-only admin cookie resolves to nobody and every admin page
redirects to `/?authError=1`. It is skipped once the database has data, so
restarts never overwrite real rows. To start against an empty database:

```bash
SEED_ON_START=false docker compose up -d --build
```

See [NOTES.md](./NOTES.md) for design decisions, trade-offs and known limits.
