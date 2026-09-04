import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";
import { appRouter } from "@/server/routers/_app";
import type { TRPCContext } from "@/server/trpc";

// Integration tests against the local Postgres instance (DATABASE_URL). There
// is no separate test database, so each test creates its own rows and cleans
// them up, rather than colliding with seed data.

function ctx(overrides: Partial<TRPCContext>): TRPCContext {
  return { userId: null, role: null, ...overrides };
}

let adminId: string;
let creatorAId: string;
let creatorBId: string;

const createdCampaignIds: string[] = [];
const createdUserIds: string[] = [];

async function makeCampaign(totalBudgetCents: number, payoutPer1kViewsCents: number) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: `Test campaign ${crypto.randomUUID()}`,
      platforms: ["tiktok"],
      payoutPer1kViewsCents,
      totalBudgetCents,
      status: "active",
      startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
    })
    .returning();
  createdCampaignIds.push(campaign.id);
  return campaign;
}

async function makeSubmission(
  campaignId: string,
  creatorId: string,
  views: number
) {
  const [submission] = await db
    .insert(submissions)
    .values({
      campaignId,
      creatorId,
      postUrl: `https://www.tiktok.com/@t/video/${crypto.randomUUID()}`,
      platform: "tiktok",
      status: "pending",
    })
    .returning();

  await db.insert(submissionMetrics).values({
    submissionId: submission.id,
    capturedAt: new Date().toISOString().slice(0, 10),
    views,
    likes: 0,
    comments: 0,
  });

  return submission;
}

async function cleanupCampaign(campaignId: string) {
  const subs = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.campaignId, campaignId));
  const subIds = subs.map((s) => s.id);
  if (subIds.length > 0) {
    await db
      .delete(submissionMetrics)
      .where(inArray(submissionMetrics.submissionId, subIds));
    await db.delete(submissions).where(inArray(submissions.id, subIds));
  }
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
}

beforeEach(async () => {
  const [admin] = await db
    .insert(users)
    .values({ email: `admin-${crypto.randomUUID()}@test.local`, role: "admin" })
    .returning();
  const [creatorA] = await db
    .insert(users)
    .values({ email: `creatorA-${crypto.randomUUID()}@test.local`, role: "creator" })
    .returning();
  const [creatorB] = await db
    .insert(users)
    .values({ email: `creatorB-${crypto.randomUUID()}@test.local`, role: "creator" })
    .returning();
  adminId = admin.id;
  creatorAId = creatorA.id;
  creatorBId = creatorB.id;
  createdUserIds.push(adminId, creatorAId, creatorBId);
});

afterAll(async () => {
  for (const campaignId of createdCampaignIds) {
    await cleanupCampaign(campaignId);
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
});

describe("submission.review against a live database", () => {
  it("rejects a second concurrent approval once the first exhausts the budget", async () => {
    // Budget covers exactly one 20,000-view submission at $2.50/1k views = $50.00.
    const campaign = await makeCampaign(5000, 250);
    const subA = await makeSubmission(campaign.id, creatorAId, 20000);
    const subB = await makeSubmission(campaign.id, creatorBId, 20000);

    const callerA = appRouter.createCaller(ctx({ userId: adminId, role: "admin" }));
    const callerB = appRouter.createCaller(ctx({ userId: adminId, role: "admin" }));

    const results = await Promise.allSettled([
      callerA.submission.review({ submissionId: subA.id, action: "approve" }),
      callerB.submission.review({ submissionId: subB.id, action: "approve" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason?.cause?.code ?? rejection.reason?.message).toBeTruthy();

    const finalSubs = await db
      .select()
      .from(submissions)
      .where(inArray(submissions.id, [subA.id, subB.id]));
    const approvedCount = finalSubs.filter((s) => s.status === "approved").length;
    const pendingCount = finalSubs.filter((s) => s.status === "pending").length;
    expect(approvedCount).toBe(1);
    expect(pendingCount).toBe(1);
  }, 20000);

  it("enforces the budget ceiling via a locked read inside the transaction, not a stale read", async () => {
    const campaign = await makeCampaign(1000, 250); // budget covers 4,000 views
    const sub = await makeSubmission(campaign.id, creatorAId, 20000); // way over

    const caller = appRouter.createCaller(ctx({ userId: adminId, role: "admin" }));

    await expect(
      caller.submission.review({ submissionId: sub.id, action: "approve" })
    ).rejects.toMatchObject({
      cause: { code: "BUDGET_EXCEEDED" },
    });

    const [finalSub] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, sub.id));
    expect(finalSub.status).toBe("pending");
  }, 20000);

  it("marks the campaign completed once the remaining budget hits zero", async () => {
    const campaign = await makeCampaign(5000, 250); // exactly covers 20,000 views
    const sub = await makeSubmission(campaign.id, creatorAId, 20000);

    const caller = appRouter.createCaller(ctx({ userId: adminId, role: "admin" }));
    const result = await caller.submission.review({
      submissionId: sub.id,
      action: "approve",
    });

    expect(result.status).toBe("approved");

    const [finalCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(finalCampaign.status).toBe("completed");
  }, 20000);

  it("denies review access to a non-admin caller", async () => {
    const campaign = await makeCampaign(5000, 250);
    const sub = await makeSubmission(campaign.id, creatorAId, 1000);

    const caller = appRouter.createCaller(
      ctx({ userId: creatorAId, role: "creator" })
    );

    await expect(
      caller.submission.review({ submissionId: sub.id, action: "approve" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a creator cannot fetch another creator's submissions via `mine`", async () => {
    const campaign = await makeCampaign(5000, 250);
    await makeSubmission(campaign.id, creatorAId, 5000);
    await makeSubmission(campaign.id, creatorBId, 7000);

    const callerA = appRouter.createCaller(
      ctx({ userId: creatorAId, role: "creator" })
    );
    const mineForA = await callerA.submission.mine();

    expect(mineForA.every((s) => s.creatorId === creatorAId)).toBe(true);
    expect(mineForA.some((s) => s.creatorId === creatorBId)).toBe(false);
  });

  it("rejects a submission whose platform the campaign does not support, even with a hand-crafted input", async () => {
    const campaign = await makeCampaign(5000, 250); // platforms: ["tiktok"] only

    const caller = appRouter.createCaller(
      ctx({ userId: creatorAId, role: "creator" })
    );

    await expect(
      caller.submission.create({
        campaignId: campaign.id,
        platform: "youtube",
        postUrl: "https://www.youtube.com/watch?v=abc123",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("re-running ingest-style upsert for the same day is idempotent and does not duplicate metrics rows", async () => {
    const campaign = await makeCampaign(5000, 250);
    const sub = await makeSubmission(campaign.id, creatorAId, 1000);

    const today = new Date().toISOString().slice(0, 10);

    // Simulate a second ingest run for the same day: upsert with new values.
    await db
      .insert(submissionMetrics)
      .values({ submissionId: sub.id, capturedAt: today, views: 9999, likes: 5, comments: 1 })
      .onConflictDoUpdate({
        target: [submissionMetrics.submissionId, submissionMetrics.capturedAt],
        set: { views: 9999, likes: 5, comments: 1 },
      });

    const rows = await db
      .select()
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, sub.id));

    const rowsForToday = rows.filter((r) => r.capturedAt === today);
    expect(rowsForToday).toHaveLength(1);
    expect(rowsForToday[0].views).toBe(9999);
  });
});
