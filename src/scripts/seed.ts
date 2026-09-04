import "dotenv/config";
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
} from "@/server/db/schema";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function upsertUser(email: string, role: "admin" | "creator") {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(users).values({ email, role }).returning();
  return created;
}
// Children before parents, for the FK constraints. The seed rebuilds every
// campaign, so these are unqualified deletes.
async function clearCampaignData() {
  await db.delete(submissionMetrics);
  await db.delete(submissions);
  await db.delete(campaigns);
}

async function insertMetricHistory(submissionId: string, series: number[]) {
  const rows = series.map((views, i) => ({
    submissionId,
    capturedAt: dateString(daysAgo(series.length - 1 - i)),
    views,
    likes: Math.floor(views * 0.05),
    comments: Math.floor(views * 0.01),
  }));

  await db
    .insert(submissionMetrics)
    .values(rows)
    .onConflictDoUpdate({
      target: [submissionMetrics.submissionId, submissionMetrics.capturedAt],
      set: {
        views: sql`excluded.views`,
        likes: sql`excluded.likes`,
        comments: sql`excluded.comments`,
      },
    });
}

async function main() {
  console.log("Seeding database...");

  const admin = await upsertUser("admin@example.com", "admin");
  const creator = await upsertUser("creator@example.com", "creator");
  const creator2 = await upsertUser("creator2@example.com", "creator");
  console.log(
    `Users: admin=${admin.id} creator=${creator.id} creator2=${creator2.id}`
  );

  await clearCampaignData();

  const [activeCampaign, draftCampaign, completedCampaign] = await db
    .insert(campaigns)
    .values([
      {
        title: "Summer Launch Clips",
        platforms: ["tiktok", "instagram"],
        payoutPer1kViewsCents: 250,
        totalBudgetCents: 500000,
        status: "active" as const,
        startsAt: daysAgo(10),
        endsAt: daysAgo(-20),
      },
      {
        title: "Fall Product Teasers",
        platforms: ["youtube"],
        payoutPer1kViewsCents: 400,
        totalBudgetCents: 300000,
        status: "draft" as const,
        startsAt: daysAgo(-5),
        endsAt: daysAgo(-35),
      },
      {
        title: "Spring Awareness Push",
        platforms: ["tiktok", "youtube", "instagram"],
        payoutPer1kViewsCents: 150,
        totalBudgetCents: 100000,
        status: "completed" as const,
        startsAt: daysAgo(60),
        endsAt: daysAgo(20),
      },
    ])
    .returning();

  console.log(
    `Campaigns: active=${activeCampaign.id} draft=${draftCampaign.id} completed=${completedCampaign.id}`
  );

  const [approved1, approved2, pending, rejected] = await db
    .insert(submissions)
    .values([
      {
        campaignId: activeCampaign.id,
        creatorId: creator.id,
        postUrl: "https://www.tiktok.com/@creator/video/1001",
        platform: "tiktok",
        status: "approved" as const,
      },
      {
        campaignId: activeCampaign.id,
        creatorId: creator2.id,
        postUrl: "https://www.instagram.com/reel/1002",
        platform: "instagram",
        status: "approved" as const,
      },
      {
        campaignId: activeCampaign.id,
        creatorId: creator.id,
        postUrl: "https://www.tiktok.com/@creator/video/1003",
        platform: "tiktok",
        status: "pending" as const,
      },
      {
        campaignId: activeCampaign.id,
        creatorId: creator2.id,
        postUrl: "https://www.instagram.com/reel/1004",
        platform: "instagram",
        status: "rejected" as const,
        rejectionReason: "Does not feature the product prominently enough.",
      },
      {
        campaignId: activeCampaign.id,
        creatorId: creator.id,
        postUrl: "https://www.tiktok.com/@creator/video/1005",
        platform: "tiktok",
        status: "pending" as const,
      },
    ])
    .returning();

  console.log(
    `Submissions: approved=[${approved1.id}, ${approved2.id}] pending=${pending.id} rejected=${rejected.id}`
  );

  await insertMetricHistory(
    approved1.id,
    [4000, 9500, 15200, 21800, 29000, 35400, 42000]
  );
  await insertMetricHistory(
    approved2.id,
    [1000, 3200, 6100, 9800, 13500, 17200, 21000]
  );

  console.log("Seed complete.");
}

// The postgres client keeps the event loop alive, so exit explicitly.
main()
  .catch((error) => {
    console.error("Seed script crashed:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
