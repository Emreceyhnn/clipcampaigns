import { inArray, sql } from "drizzle-orm";

import { db } from "./db";
import { submissionMetrics, submissions } from "./db/schema";

type Queryable = Pick<typeof db, "selectDistinctOn">;
type Executable = Pick<typeof db, "execute">;

// Latest views per submission. Submissions with no metrics yet are absent from
// the map, so callers decide what that means for them.
export async function latestViewsBySubmission(
  submissionIds: string[],
  tx: Queryable = db
): Promise<Map<string, number>> {
  if (submissionIds.length === 0) return new Map();

  // DISTINCT ON keeps only the newest row per submission, so months of history
  // still cost one row each.
  const rows = await tx
    .selectDistinctOn([submissionMetrics.submissionId], {
      submissionId: submissionMetrics.submissionId,
      views: submissionMetrics.views,
    })
    .from(submissionMetrics)
    .where(inArray(submissionMetrics.submissionId, submissionIds))
    .orderBy(
      submissionMetrics.submissionId,
      sql`${submissionMetrics.capturedAt} desc`
    );

  return new Map(rows.map((row) => [row.submissionId, row.views]));
}

// Approved views and the spend they commit for one campaign: the newest metric
// row per approved submission, floored to whole thousands of views before
// summing. Flooring per submission (not on the total) keeps this equal to
// calculateEarningsCents applied one submission at a time.
//
// One round trip on purpose: submission.review calls this inside its FOR UPDATE
// lock, where extra queries widen the window concurrent approvals wait on.
export async function campaignApprovedTotals(
  campaignId: string,
  payoutPer1kViewsCents: number,
  tx: Executable = db
): Promise<{ approvedViews: number; spentCents: number }> {
  const [row] = await tx.execute<{ approvedViews: number; spentCents: number }>(sql`
    with latest as (
      select distinct on (m.submission_id) m.views
      from ${submissionMetrics} m
      join ${submissions} s on s.id = m.submission_id
      where s.campaign_id = ${campaignId} and s.status = 'approved'
      order by m.submission_id, m.captured_at desc
    )
    select
      coalesce(sum(views), 0)::int as "approvedViews",
      coalesce(sum(floor(views / 1000) * ${payoutPer1kViewsCents}), 0)::int
        as "spentCents"
    from latest
  `);

  return {
    approvedViews: Number(row.approvedViews),
    spentCents: Number(row.spentCents),
  };
}
