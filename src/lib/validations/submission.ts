import { z } from "zod";

import { platformEnum } from "./campaign";

export type Platform = z.infer<typeof platformEnum>;

const platformUrlPatterns: Record<Platform, RegExp> = {
  tiktok: /^https?:\/\/(www\.)?tiktok\.com\/.+/i,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/.+/i,
  youtube: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i,
};

// Shared with the client so the platform select can follow what's typed into
// the URL field, using the same patterns the schema validates against.
export function detectPlatformFromUrl(url: string): Platform | null {
  for (const [platform, pattern] of Object.entries(platformUrlPatterns)) {
    if (pattern.test(url)) return platform as Platform;
  }
  return null;
}

export const submissionFormSchema = z
  .object({
    campaignId: z.string().uuid(),
    platform: platformEnum,
    postUrl: z
      .string()
      .min(1, "Post URL is required")
      .max(2048, "Post URL must be 2048 characters or fewer")
      .url("Enter a valid URL"),
  })
  .superRefine((data, ctx) => {
    const detected = detectPlatformFromUrl(data.postUrl);
    if (!detected) {
      ctx.addIssue({
        code: "custom",
        path: ["postUrl"],
        message: "URL must be a TikTok, Instagram, or YouTube post link",
      });
    } else if (detected !== data.platform) {
      ctx.addIssue({
        code: "custom",
        path: ["postUrl"],
        message: `URL does not look like a ${data.platform} link`,
      });
    }
  });

export type SubmissionFormValues = z.infer<typeof submissionFormSchema>;
