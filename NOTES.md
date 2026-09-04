# Notes

## Setup

```bash
docker compose up -d postgres   # local Postgres on :5432
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm seed        # optional, gives you an admin + a couple creators + sample campaigns
pnpm dev         # http://localhost:3000
```

`pnpm test` needs the same Postgres up and migrated first (there's no separate
test DB, see below), so:

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm test
```

No real auth — there's a user switcher on the home page that just sets a
`userEmail` cookie, and `src/server/context.ts` resolves it against the
`users` table. If you show up with no cookie you're signed in as
`admin@example.com`, which is why seeding matters on a fresh DB (more on that
below). Everything else, including running the full thing in Docker with
nginx in front, is in README.md.

## Budget and concurrent approvals

This was the part I spent the most time on. The problem: two admins approve
different submissions on the same campaign at basically the same time, and
the budget only has room for one of them.

My first instinct was the obvious one — read current spend, check it against
the budget, then update. That works fine until you actually run it
concurrently, because both transactions can read the same "spend so far"
before either one commits, and both sail through the check. I thought about
doing this optimistically instead (a version column, retry on conflict), but
that felt like the wrong shape for this — the second approval isn't supposed
to succeed after a retry, it's supposed to fail cleanly, because the budget
genuinely doesn't have room for it anymore.

So `submission.review` locks the campaign row with `SELECT ... FOR UPDATE`
inside the transaction. Whoever gets there first holds the lock, the second
approval just waits, and by the time it gets to read spend it's reading the
number that already accounts for the first approval. If it's over budget it
throws a `BUDGET_EXCEEDED` error and rolls back.

There's a test for this in `submission.review.test.ts` that fires two admin
approvals at the same campaign with `Promise.allSettled` and checks that
exactly one goes through.

One thing worth calling out: spend is calculated from each submission's most
recent metric row, floored to whole thousands before summing per submission
(not floored once on the total) — otherwise the aggregate wouldn't match what
`calculateEarningsCents` gives you for a single submission.

## A few notes on the queries

- `latestViewsBySubmission` and `campaignApprovedTotals` in `metrics.ts` use
  `DISTINCT ON` so a submission with months of daily metrics still only costs
  one row to look up, not one per day.
- The budget check above calls `campaignApprovedTotals` inside the row lock,
  so I made it return both views and spend in one query — every extra round
  trip there is time another approval spends waiting.
- Campaign list computes spend per page (one grouped query) rather than per
  row, and pending-review counts are a second grouped query that runs
  alongside it. There's a partial index on pending submissions since those
  are the minority — most submissions end up approved or rejected and just
  sit there.
- The daily views chart query only pulls the window it actually renders
  instead of loading all history and slicing client-side, and Recharts is
  lazy-loaded so it's not in the initial bundle.
- Search on the admin list is debounced and keeps showing the old page while
  the new one loads instead of flashing a loading state.

## Dates

Campaign start/end are meant to be calendar days, but a `Date` over the wire
is really a UTC instant — midnight in Istanbul time can serialize as the
evening before in UTC and then look like it's "in the past" once it hits the
server. So I send plain `YYYY-MM-DD` strings instead, which sidesteps the
whole problem since there's no instant to shift.

Two things fell out of that: the "no start date in the past" check gives a
day of slack, since "today" depends on whose timezone you ask (UTC+14 vs
UTC-12 is a full day apart) — it only rejects a date that's in the past
everywhere. And the form needs `raw: true` passed to `zodResolver`, otherwise
it hands `onSubmit` the parsed Zod output, which turns the strings back into
`Date` objects and you're right back to the original bug.

## Why the container seeds on start

`docker-entrypoint.sh` runs migrations, then seeds only if the DB is empty.
This isn't just for convenience — because auth resolves against the `users`
table and a first-time visitor gets `admin@example.com` by default, an empty
database means that row doesn't exist, so every admin page just redirects to
`/?authError=1`. A fresh `docker compose up` looks broken when it's actually
just empty. The seed script clears and rebuilds campaign data when it runs,
so it can't run on every restart — hence `--if-empty`, which checks for
existing rows first. `SEED_ON_START=false` skips it entirely if you want a
clean slate.

## What I left out on purpose

- Real auth, obviously — covered above.
- A dedicated test database. The integration tests run against the same local
  Postgres and clean up after themselves.
- Any styling beyond what shadcn gives you by default.
- The `paid` submission status is in the schema but nothing transitions a
  submission into it — actually paying out felt out of scope here.
- `campaign.create` doesn't stop you from creating a campaign directly as
  `active`. Nothing in the spec says you can't, so I left it alone rather than
  guessing at a rule that wasn't asked for.
- New submissions get a random initial view count standing in for hitting the
  actual platform API.

## Known gaps

The daily views series in the campaign overview is capped at 90 days
(`MAX_DAYS` in `campaign.ts`). It still fills in zero-metric days correctly
within that window, it just won't show you a full year for a long-running
campaign. There's no upper bound in the spec so I picked something reasonable
rather than leaving it unbounded.

Platform is checked twice — once in the Zod schema (does the URL look right
for the platform picked) and once in `submission.create` (does the campaign
even accept that platform). That second one has to be server-side, otherwise
someone could hand-craft a request and put a YouTube link on a TikTok-only
campaign.

The ingest script itself (`pnpm ingest`) is idempotent per day via an upsert,
and wraps each submission in `Promise.allSettled` so one failure doesn't take
down the run — it logs the failure and exits non-zero if anything failed.
What I don't have is a test that actually runs the script end to end,
including the case where one submission fails and the rest still go through.
`submission.review.test.ts` tests the same upsert logic directly against the
schema, but that's not the same as exercising `ingest.ts`'s own `main()`. If
I'm honest, this is the one piece of the "minimum coverage" list in the brief
I'd call thin rather than solid.

## First thing I'd fix given another day

Real auth. The brief explicitly says the cookie switcher is fine for this, so
I didn't force it in under time pressure — but if this were actually going
live, I have a small transactional email microservice I already built for a
previous project, and I'd rather plug that in than reach for a third-party
auth provider. It'd sit in `docker-compose.yml` alongside postgres/app/nginx,
send a magic link, and the `userEmail` cookie in `context.ts` would get
replaced with a real signed session once someone verifies. The nice part is
the role/ownership logic in `require-role.ts` and everywhere else wouldn't
need to change at all — that's already written as if a real user were behind
`userId`, so only the bit that decides who `userId` is would move.

Right after that, the ingest script test gap above. And if there's time
after that, revisiting the 90-day cap on the overview chart — it was a guess,
not something I'd stand behind as final.

## Where I used AI

I used it while building this the way I normally do — scaffolding the
Drizzle schema and migrations, tRPC router boilerplate, wiring up
react-hook-form with shadcn — and then went back over what it gave me rather
than taking it as-is. A few things it got wrong that I had to catch: the
first version of the budget check it wrote had no row lock at all, which is
exactly the race the brief is testing for, so I had it redo that once I
explained why the unlocked version lets two approvals both pass. It also
defaulted the campaign dates to native `Date` objects over the wire, which is
the timezone bug described above — I had to steer it toward the string
format and then separately catch that `zodResolver` needed `raw: true` or the
fix wouldn't actually take. The seed script it wrote also just re-ran
destructively on every restart, which would nuke real data in production, so
I added the `--if-empty` guard myself.

Past the actual bug-fixing, I also used it for a last pass over the code for
clarity — renaming things, splitting up a couple of functions that had grown
too many responsibilities, making error messages more useful — basically a
second pair of eyes on code I'd been staring at too long to see clearly
anymore. And separately, when I deployed this to a VPS, I ran into an SSL
certificate issue with nginx not picking up a valid cert on first boot — used
AI there too, but that was infra debugging around the certificate chain and
nginx config, not the application itself.

None of this was copy-paste — everything above is stuff I checked and, in a
few cases, had to actively push back on before it was right.
