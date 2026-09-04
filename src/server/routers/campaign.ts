import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, ilike, inArray, sql } from "drizzle-orm";

import { router, adminProcedure, protectedProcedure, publicProcedure } from "../trpc";
import {
  campaignFormSchema,
  campaignStatusEnum,
  campaignUpdateSchema,
} from "@/lib/validations/campaign";
import { calculateEarningsCents, wouldExceedBudget } from "@/lib/payout";
import { db } from "../db";
import { campaigns, submissionMetrics, submissions, users } from "../db/schema";
import { campaignApprovedTotals, latestViewsBySubmission } from "../metrics";

// Postgres `date` columns come back as YYYY-MM-DD; match that when keying by day.
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export const campaignRouter = router({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        status: campaignStatusEnum.optional(),
      })
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.search) {
        conditions.push(ilike(campaigns.title, `%${input.search}%`));
      }
      if (input.status) {
        conditions.push(eq(campaigns.status, input.status));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(campaigns)
          .where(where)
          .orderBy(desc(campaigns.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db.select({ total: count() }).from(campaigns).where(where),
      ]);

      // Spend and pending-review counts for this page only, one grouped query
      // each rather than one per row.
      const pageIds = items.map((c) => c.id);
      const spentByCampaign = new Map<string, number>();
      const pendingByCampaign = new Map<string, number>();

      if (pageIds.length > 0) {
        const latest = db
          .selectDistinctOn([submissionMetrics.submissionId], {
            campaignId: submissions.campaignId,
            views: submissionMetrics.views,
          })
          .from(submissionMetrics)
          .innerJoin(submissions, eq(submissionMetrics.submissionId, submissions.id))
          .where(
            and(
              eq(submissions.status, "approved"),
              inArray(submissions.campaignId, pageIds)
            )
          )
          .orderBy(
            submissionMetrics.submissionId,
            desc(submissionMetrics.capturedAt)
          )
          .as("latest");

        // Neither aggregate feeds the other, so they go out together.
        const [spendRows, pendingRows] = await Promise.all([
          db
            .select({
              campaignId: latest.campaignId,
              budgetSpentCents:
                sql<number>`coalesce(sum(floor(${latest.views} / 1000) * ${campaigns.payoutPer1kViewsCents}), 0)::int`.mapWith(
                  Number
                ),
            })
            .from(latest)
            .innerJoin(campaigns, eq(campaigns.id, latest.campaignId))
            .groupBy(latest.campaignId),
          db
            .select({
              campaignId: submissions.campaignId,
              pending: count(),
            })
            .from(submissions)
            .where(
              and(
                eq(submissions.status, "pending"),
                inArray(submissions.campaignId, pageIds)
              )
            )
            .groupBy(submissions.campaignId),
        ]);

        for (const row of spendRows) {
          spentByCampaign.set(row.campaignId, row.budgetSpentCents);
        }
        // Campaigns with nothing pending are absent here and fall through to 0.
        for (const row of pendingRows) {
          pendingByCampaign.set(row.campaignId, row.pending);
        }
      }

      return {
        items: items.map((campaign) => ({
          ...campaign,
          budgetSpentCents: spentByCampaign.get(campaign.id) ?? 0,
          pendingSubmissionCount: pendingByCampaign.get(campaign.id) ?? 0,
        })),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    }),

  listActive: publicProcedure.query(async () => {
    return db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, "active"))
      .orderBy(desc(campaigns.createdAt));
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      return campaign;
    }),

  create: adminProcedure.input(campaignFormSchema).mutation(async ({ input }) => {
    const [created] = await db.insert(campaigns).values(input).returning();
    return created;
  }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid() }).and(campaignUpdateSchema))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const [updated] = await db
        .update(campaigns)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(campaigns.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      return updated;
    }),

  reviewQueue: adminProcedure
    .input(z.object({ campaignId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      const rows = await db
        .select({
          id: submissions.id,
          postUrl: submissions.postUrl,
          platform: submissions.platform,
          creatorEmail: users.email,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .innerJoin(users, eq(submissions.creatorId, users.id))
        .where(
          and(
            eq(submissions.campaignId, input.campaignId),
            eq(submissions.status, "pending")
          )
        )
        .orderBy(asc(submissions.createdAt));

      // The same spend the review mutation checks against, so this flag matches
      // approving that row next. The check on the attempt is what enforces it.
      const { spentCents: currentSpentCents } = await campaignApprovedTotals(
        campaign.id,
        campaign.payoutPer1kViewsCents
      );
      const latestViews = await latestViewsBySubmission(rows.map((r) => r.id));

      return {
        campaignId: input.campaignId,
        submissions: rows.map((row) => {
          const views = latestViews.get(row.id) ?? 0;
          const earningsCents = calculateEarningsCents(
            views,
            campaign.payoutPer1kViewsCents
          );
          return {
            ...row,
            views,
            wouldExceedBudget: wouldExceedBudget(
              currentSpentCents,
              earningsCents,
              campaign.totalBudgetCents
            ),
          };
        }),
      };
    }),

  overview: adminProcedure
    .input(z.object({ campaignId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      // Capped to a recent window so a long campaign can't return an unbounded series.
      const MAX_DAYS = 90;
      const today = new Date();
      const endsAt = new Date(campaign.endsAt);
      const rangeEnd = endsAt < today ? endsAt : today;
      let seriesStart = new Date(campaign.startsAt);
      const earliestStart = new Date(rangeEnd);
      earliestStart.setDate(earliestStart.getDate() - MAX_DAYS);
      if (seriesStart < earliestStart) seriesStart = earliestStart;

      const [totals, dailyRows] = await Promise.all([
        campaignApprovedTotals(input.campaignId, campaign.payoutPer1kViewsCents),
        db
          .select({
            date: submissionMetrics.capturedAt,
            views: sql<number>`sum(${submissionMetrics.views})`.mapWith(Number),
          })
          .from(submissionMetrics)
          .innerJoin(submissions, eq(submissionMetrics.submissionId, submissions.id))
          .where(
            and(
              eq(submissions.campaignId, input.campaignId),
              eq(submissions.status, "approved"),
              gte(submissionMetrics.capturedAt, dateKey(seriesStart))
            )
          )
          .groupBy(submissionMetrics.capturedAt)
          .orderBy(asc(submissionMetrics.capturedAt)),
      ]);

      const { approvedViews, spentCents: budgetSpentCents } = totals;

      const viewsByDate = new Map(dailyRows.map((row) => [row.date, row.views]));
      const dailyViews: { date: string; views: number }[] = [];
      for (
        const cursor = new Date(seriesStart);
        cursor <= rangeEnd;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        const date = dateKey(cursor);
        dailyViews.push({ date, views: viewsByDate.get(date) ?? 0 });
      }

      return {
        campaignId: input.campaignId,
        approvedViews,
        budgetSpentCents,
        budgetLeftCents: campaign.totalBudgetCents - budgetSpentCents,
        dailyViews,
      };
    }),
});
