import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { campaigns, users } from "@/server/db/schema";
import { appRouter } from "@/server/routers/_app";
import type { TRPCContext } from "@/server/trpc";

// Integration tests against the local Postgres instance (DATABASE_URL), same
// convention as submission.review.test.ts: each test creates its own rows.

function ctx(overrides: Partial<TRPCContext>): TRPCContext {
  return { userId: null, role: null, ...overrides };
}

// The router takes calendar days as YYYY-MM-DD strings now (see
// lib/validations/campaign.ts), keyed off UTC so these tests behave the same
// regardless of the machine's local time zone.
function daysFromToday(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const basePayload = {
  title: "Date rule test campaign",
  platforms: ["tiktok"] as ("tiktok" | "instagram" | "youtube")[],
  payoutPer1kViewsCents: 100,
  totalBudgetCents: 10000,
  status: "draft" as const,
};

let adminId: string;
const createdUserIds: string[] = [];
const createdCampaignIds: string[] = [];

beforeEach(async () => {
  const [admin] = await db
    .insert(users)
    .values({ email: `admin-${crypto.randomUUID()}@test.local`, role: "admin" })
    .returning();
  adminId = admin.id;
  createdUserIds.push(adminId);
});

afterAll(async () => {
  if (createdCampaignIds.length > 0) {
    await db.delete(campaigns).where(inArray(campaigns.id, createdCampaignIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
});

function adminCaller() {
  return appRouter.createCaller(ctx({ userId: adminId, role: "admin" }));
}

describe("campaign.create date rules against a live database", () => {
  it("rejects a start date two days before today", async () => {
    // One day of slack is intentional (see lib/validations/campaign.ts) to
    // absorb the gap between the client's and server's time zones, so the
    // rejection case needs to be unambiguously in the past everywhere.
    await expect(
      adminCaller().campaign.create({
        ...basePayload,
        startsAt: daysFromToday(-2),
        endsAt: daysFromToday(10),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an end date before the start date, even when both are in the future", async () => {
    await expect(
      adminCaller().campaign.create({
        ...basePayload,
        startsAt: daysFromToday(10),
        endsAt: daysFromToday(3),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an end date equal to the start date", async () => {
    await expect(
      adminCaller().campaign.create({
        ...basePayload,
        startsAt: daysFromToday(5),
        endsAt: daysFromToday(5),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a start AND end date both before today with end before start", async () => {
    // The exact combination a user could produce by leaving both pickers on
    // old values: neither field alone looks obviously wrong without the other.
    await expect(
      adminCaller().campaign.create({
        ...basePayload,
        startsAt: daysFromToday(-5),
        endsAt: daysFromToday(-10),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts a valid future range starting today", async () => {
    const created = await adminCaller().campaign.create({
      ...basePayload,
      startsAt: daysFromToday(0),
      endsAt: daysFromToday(30),
    });
    createdCampaignIds.push(created.id);
    expect(created.id).toBeTruthy();
  });
});

describe("campaign.update date rules against a live database", () => {
  async function makeCampaign() {
    const created = await adminCaller().campaign.create({
      ...basePayload,
      startsAt: daysFromToday(1),
      endsAt: daysFromToday(10),
    });
    createdCampaignIds.push(created.id);
    return created;
  }

  it("rejects an update where the end date is before the start date", async () => {
    const campaign = await makeCampaign();
    await expect(
      adminCaller().campaign.update({
        id: campaign.id,
        ...basePayload,
        startsAt: daysFromToday(5),
        endsAt: daysFromToday(2),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an update where both dates move into the past with end before start", async () => {
    const campaign = await makeCampaign();
    await expect(
      adminCaller().campaign.update({
        id: campaign.id,
        ...basePayload,
        startsAt: daysFromToday(-3),
        endsAt: daysFromToday(-8),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an update where end equals start", async () => {
    const campaign = await makeCampaign();
    await expect(
      adminCaller().campaign.update({
        id: campaign.id,
        ...basePayload,
        startsAt: daysFromToday(2),
        endsAt: daysFromToday(2),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows editing an already-started campaign as long as end stays after start", async () => {
    const campaign = await makeCampaign();
    const updated = await adminCaller().campaign.update({
      id: campaign.id,
      ...basePayload,
      startsAt: daysFromToday(-10),
      endsAt: daysFromToday(20),
    });
    expect(new Date(updated.startsAt).toISOString().slice(0, 10)).toBe(
      daysFromToday(-10)
    );
  });
});
