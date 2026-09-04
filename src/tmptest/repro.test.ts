import { describe, it, expect } from "vitest";
import { campaignFormSchema } from "@/lib/validations/campaign";

describe("repro", () => {
  it("accepts YYYY-MM-DD strings", () => {
    const r = campaignFormSchema.safeParse({
      title: "asdad",
      platforms: ["tiktok"],
      payoutPer1kViewsCents: 15,
      totalBudgetCents: 150,
      status: "draft",
      startsAt: "2026-09-04",
      endsAt: "2026-09-05",
    });
    console.log("string parse success:", r.success);
    if (!r.success) console.log(JSON.stringify(r.error.issues, null, 2));
  });

  it("what a Date-turned-ISO looks like", () => {
    const r = campaignFormSchema.safeParse({
      title: "asdad",
      platforms: ["tiktok"],
      payoutPer1kViewsCents: 15,
      totalBudgetCents: 150,
      status: "draft",
      startsAt: "2026-09-04T00:00:00.000Z",
      endsAt: "2026-09-05T00:00:00.000Z",
    });
    console.log("ISO parse success:", r.success);
    if (!r.success) console.log(JSON.stringify(r.error.issues, null, 2));
  });
});
