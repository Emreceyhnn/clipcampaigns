import { describe, expect, it } from "vitest";
import { submissionFormSchema } from "./submission";

const baseCampaignId = "11111111-1111-4111-8111-111111111111";

describe("submissionFormSchema", () => {
  it("accepts a valid tiktok URL", () => {
    const result = submissionFormSchema.safeParse({
      campaignId: baseCampaignId,
      platform: "tiktok",
      postUrl: "https://www.tiktok.com/@creator/video/12345",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid instagram URL", () => {
    const result = submissionFormSchema.safeParse({
      campaignId: baseCampaignId,
      platform: "instagram",
      postUrl: "https://www.instagram.com/reel/abc123/",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid youtube URL, including youtu.be short links", () => {
    expect(
      submissionFormSchema.safeParse({
        campaignId: baseCampaignId,
        platform: "youtube",
        postUrl: "https://www.youtube.com/watch?v=abc123",
      }).success
    ).toBe(true);

    expect(
      submissionFormSchema.safeParse({
        campaignId: baseCampaignId,
        platform: "youtube",
        postUrl: "https://youtu.be/abc123",
      }).success
    ).toBe(true);
  });

  it("rejects a URL that does not match the selected platform", () => {
    const result = submissionFormSchema.safeParse({
      campaignId: baseCampaignId,
      platform: "tiktok",
      postUrl: "https://www.instagram.com/reel/abc123/",
    });
    expect(result.success).toBe(false);
  });

  it("rejects garbage input", () => {
    const result = submissionFormSchema.safeParse({
      campaignId: baseCampaignId,
      platform: "tiktok",
      postUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
