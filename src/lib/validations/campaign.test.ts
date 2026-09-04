import { describe, expect, it } from "vitest";

import { campaignFormSchema, campaignUpdateSchema } from "./campaign";

// Keyed off UTC so these behave the same regardless of the machine's time zone.
function daysFromToday(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const base = {
  title: "Summer Launch Clips",
  platforms: ["tiktok"],
  payoutPer1kViewsCents: 250,
  totalBudgetCents: 500000,
  status: "draft" as const,
};

describe("campaignFormSchema (create)", () => {
  it("accepts a campaign starting today", () => {
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(0),
      endsAt: daysFromToday(30),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a campaign starting in the future", () => {
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(7),
      endsAt: daysFromToday(30),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a start date of yesterday (time zone tolerance)", () => {
    // The schema allows one day of slack; see campaign.ts.
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(-1),
      endsAt: daysFromToday(30),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a start date two days in the past", () => {
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(-2),
      endsAt: daysFromToday(30),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "startsAt")).toBe(true);
  });

  it("still rejects an end date that is not after the start", () => {
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(5),
      endsAt: daysFromToday(5),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "endsAt")).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(10),
      endsAt: daysFromToday(3),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "endsAt")).toBe(true);
  });

  it("accepts an end date one day after the start", () => {
    const result = campaignFormSchema.safeParse({
      ...base,
      startsAt: daysFromToday(10),
      endsAt: daysFromToday(11),
    });
    expect(result.success).toBe(true);
  });
});

describe("campaignUpdateSchema (edit)", () => {
  it("allows editing a campaign that already started", () => {
    const result = campaignUpdateSchema.safeParse({
      ...base,
      startsAt: daysFromToday(-10),
      endsAt: daysFromToday(20),
    });
    expect(result.success).toBe(true);
  });

  it("keeps enforcing end after start", () => {
    const result = campaignUpdateSchema.safeParse({
      ...base,
      startsAt: daysFromToday(-10),
      endsAt: daysFromToday(-20),
    });
    expect(result.success).toBe(false);
  });
});
