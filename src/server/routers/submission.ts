import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import { router, adminProcedure, protectedProcedure } from "../trpc";
import { submissionFormSchema } from "@/lib/validations/submission";
import { reviewActionSchema } from "@/lib/validations/review";
import { calculateEarningsCents, wouldExceedBudget } from "@/lib/payout";
import { db } from "../db";
import { campaigns, submissionMetrics, submissions } from "../db/schema";
import { campaignApprovedTotals, latestViewsBySubmission } from "../metrics";

// Stands in for fetching the platform's view count at submission time, so a
// new clip has a real effect on campaign spend as soon as it's approved.
const MIN_INITIAL_VIEWS = 1000;
const MAX_INITIAL_VIEWS = 10000;

function randomInitialViews(): number {
  return (
    Math.floor(Math.random() * (MAX_INITIAL_VIEWS - MIN_INITIAL_VIEWS + 1)) +
    MIN_INITIAL_VIEWS
  );
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const submissionRouter = router({
  create: protectedProcedure
    .input(submissionFormSchema)
    .mutation(async ({ ctx, input }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      if (campaign.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This campaign is not currently accepting submissions",
        });
      }

      if (!campaign.platforms.includes(input.platform)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This campaign does not accept submissions for that platform",
        });
      }

      const [existing] = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(
          and(
            eq(submissions.campaignId, input.campaignId),
            eq(submissions.postUrl, input.postUrl)
          )
        )
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This URL has already been submitted to this campaign",
        });
      }

      try {
        return await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(submissions)
            .values({
              campaignId: input.campaignId,
              creatorId: ctx.userId,
              platform: input.platform,
              postUrl: input.postUrl,
            })
            .returning();

          await tx.insert(submissionMetrics).values({
            submissionId: created.id,
            capturedAt: todayDateKey(),
            views: randomInitialViews(),
          });

          return created;
        });
      } catch (error) {
        // Backstop for the unique (campaignId, postUrl) constraint in case of
        // a race between the pre-check above and the insert.
        throw new TRPCError({
          code: "CONFLICT",
          message: "This URL has already been submitted to this campaign",
          cause: error,
        });
      }
    }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: submissions.id,
        creatorId: submissions.creatorId,
        campaignTitle: campaigns.title,
        payoutPer1kViewsCents: campaigns.payoutPer1kViewsCents,
        postUrl: submissions.postUrl,
        platform: submissions.platform,
        status: submissions.status,
        rejectionReason: submissions.rejectionReason,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
      .where(eq(submissions.creatorId, ctx.userId))
      .orderBy(desc(submissions.createdAt));

    const latestViews = await latestViewsBySubmission(rows.map((r) => r.id));

    return rows.map((row) => {
      const views = latestViews.get(row.id) ?? 0;
      return {
        id: row.id,
        creatorId: row.creatorId,
        campaignTitle: row.campaignTitle,
        postUrl: row.postUrl,
        platform: row.platform,
        status: row.status,
        rejectionReason: row.rejectionReason,
        views,
        estimatedEarningsCents: calculateEarningsCents(
          views,
          row.payoutPer1kViewsCents
        ),
        createdAt: row.createdAt,
      };
    });
  }),

  review: adminProcedure
    .input(reviewActionSchema)
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [submission] = await tx
          .select()
          .from(submissions)
          .where(eq(submissions.id, input.submissionId))
          .limit(1);

        if (!submission) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
        }

        if (submission.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only pending submissions can be reviewed",
          });
        }

        if (input.action === "reject") {
          const [updated] = await tx
            .update(submissions)
            .set({
              status: "rejected",
              rejectionReason: input.rejectionReason,
              updatedAt: new Date(),
            })
            .where(eq(submissions.id, input.submissionId))
            .returning();

          return updated;
        }

        // Lock the campaign row so concurrent approvals serialize here rather
        // than racing on a stale read of current spend.
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, submission.campaignId))
          .for("update")
          .limit(1);

        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
        }

        const { spentCents: currentSpentCents } = await campaignApprovedTotals(
          campaign.id,
          campaign.payoutPer1kViewsCents,
          tx
        );

        const [latestMetric] = await tx
          .select({ views: submissionMetrics.views })
          .from(submissionMetrics)
          .where(eq(submissionMetrics.submissionId, submission.id))
          .orderBy(desc(submissionMetrics.capturedAt))
          .limit(1);

        const newEarningsCents = calculateEarningsCents(
          latestMetric?.views ?? 0,
          campaign.payoutPer1kViewsCents
        );

        if (
          wouldExceedBudget(
            currentSpentCents,
            newEarningsCents,
            campaign.totalBudgetCents
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Approving this submission would exceed the campaign budget",
            cause: { code: "BUDGET_EXCEEDED" },
          });
        }

        const [updated] = await tx
          .update(submissions)
          .set({
            status: "approved",
            rejectionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(submissions.id, input.submissionId))
          .returning();

        const remainingBudgetCents =
          campaign.totalBudgetCents - (currentSpentCents + newEarningsCents);

        if (remainingBudgetCents <= 0 && campaign.status !== "completed") {
          await tx
            .update(campaigns)
            .set({ status: "completed", updatedAt: new Date() })
            .where(eq(campaigns.id, campaign.id));
        }

        return updated;
      });
    }),
});
