# Notes

Design decisions, trade-offs and known limits. Setup instructions live in
[README.md](./README.md).

## Budget enforcement and concurrent approvals

This is the part of the app worth reading first.

Approving a submission commits campaign budget, so two admins approving
different submissions at the same moment must not both pass a budget check that
only one of them can afford. `submission.review` takes a `SELECT ... FOR UPDATE`
on the campaign row inside its transaction, so concurrent approvals against the
same campaign serialize instead of both reading a stale "current spend". If the
check fails, the transaction throws `BUDGET_EXCEEDED` and rolls back.

`src/server/routers/submission.review.test.ts` covers this against a real
database: two admin callers hit `submission.review` concurrently via
`Promise.allSettled`, and the test asserts exactly one approval survives, the
other is rejected with `BUDGET_EXCEEDED`, and the final row states agree.

Spend itself is the newest metric row per approved submission, floored to whole
thousands of views per submission before summing. Flooring per submission rather
than on the total matters: it's what keeps the aggregate equal to
`calculateEarningsCents` applied one submission at a time.

## Aggregation in Postgres, not JavaScript

- `latestViewsBySubmission` and `campaignApprovedTotals` (`src/server/metrics.ts`)
  use `DISTINCT ON`, so a submission with months of history costs one row rather
  than one per captured day.
- `campaignApprovedTotals` returns views and spend in a single query. That
  matters most in `submission.review`, which calls it inside the `FOR UPDATE`
  lock, where every extra round trip widens the window concurrent approvals wait
  on.
- `campaign.list` computes spend for the campaigns on the current page in one
  grouped query, not one per row.
- `campaign.overview`'s daily-views query is bounded by the same window it
  renders instead of aggregating all history and slicing in JS. Its two
  remaining queries run concurrently.
- The detail page loads Recharts through `next/dynamic`, keeping ~130 kB out of
  that route's initial bundle.
- Admin campaign search is debounced (300 ms) and keeps the previous page
  visible while refetching.

## Dates are calendar days, not instants

Campaign start/end are days on a calendar, but a `Date` sent over the wire
serializes as a UTC instant — midnight in UTC+3 arrives as the previous evening
in UTC and can read as "in the past" on the server. So the wire format is a
plain `YYYY-MM-DD` string, which has no instant to shift, and both ends agree on
which day was picked.

Two consequences worth knowing:

- The "no start date in the past" rule allows one day of slack. "Today" depends
  on who is asking — UTC+14 is a full day ahead of UTC-12 — so the check accepts
  anyone's real today and rejects only days that are past everywhere.
- The form passes `raw: true` to `zodResolver`. Without it the resolver hands
  `onSubmit` the schema's *parsed* output, turning those strings back into
  `Date`s that serialize as ISO timestamps the server then rejects.

## Deliberate omissions

- **Real auth.** The current user is a `userEmail` cookie resolved against the
  `users` table, switched from the dev-only switcher on `/`. No passwords,
  sessions or OAuth.
- **A separate test database.** Integration tests share the local Postgres
  instance and clean up their own rows.
- **Styling** beyond shadcn defaults.

## Known limitations

- `campaign.overview`'s daily views series is capped at 90 days (`MAX_DAYS` in
  `src/server/routers/campaign.ts`), even though it fills gap days with 0 across
  the campaign period as specified. A campaign running longer than that returns
  only its most recent 90 days. The spec sets no upper bound, so this is a
  deliberate cut to avoid an unbounded series rather than a settled product
  decision.
- The `paid` submission status exists in the schema but no router transitions a
  submission into it; payout initiation past "approved" is out of scope.
- `campaign.create` does not restrict which status a campaign can be created
  with, so an admin can create one directly as `active`. The spec doesn't
  prohibit it — noting it as an unenforced assumption, not a bug.
- Platform validation happens in two places on purpose. `submissionFormSchema`
  checks that the URL looks like a post on the platform the creator picked;
  `submission.create` separately checks the campaign actually accepts that
  platform. The second has to live on the server — the first alone would let a
  hand-crafted request put a YouTube clip on a TikTok-only campaign.
- New submissions are seeded with a random initial view count, standing in for
  fetching the real number from the platform at submission time.

## Where AI tooling was used

I used Claude Code throughout — schema, routers, validation, pages, the ingest
script and the tests. The parts I had to think about and correct:

- **The concurrent-approval race.** The first pass read current spend and wrote
  the approval as two separate statements, which is exactly the race the spec
  asks about. I rewrote it around `SELECT ... FOR UPDATE`. I considered a `CHECK`
  constraint or a stored `spent_cents` column instead, but spend depends on the
  *latest* metric row per submission, which a constraint can't express cleanly.
- **The test for that race.** The generated version asserted on mocked
  internals and would have passed even with the locking broken. I replaced it
  with two concurrent callers against a live database.
- **Platform validation.** The generated `submission.create` trusted the Zod
  schema, which only validates the URL against the platform the *client* sent,
  not against what the campaign accepts. Added the server-side check and a
  regression test.
- **Date handling.** Dates went over the wire as `Date` objects, which shifted
  the calendar day by one for anyone east of UTC and made valid start dates look
  like past ones. Moved the whole path to `YYYY-MM-DD` strings.

Mostly taken as-is: the shadcn component wiring, the Drizzle schema definitions,
and the chart/table markup.
