import { z } from "zod";

export const platformEnum = z.enum(["tiktok", "instagram", "youtube"]);

export const campaignStatusEnum = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
]);

// Campaign dates are calendar days, not instants. Sending a Date over the wire
// serializes it as a UTC instant, so midnight in UTC+3 arrives as the previous
// evening in UTC and can read as "in the past" on the server. A plain
// YYYY-MM-DD string has no instant to shift, so both ends agree on the day.
const dateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
  .transform((value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  });

// Also accepts a Date so seed scripts and tests can pass one directly; both
// forms normalize to the same UTC-midnight value.
const campaignDate = z.union([dateOnlyString, z.date()]);

// "Today" depends on who is asking — UTC+14 is a full day ahead of UTC-12, and
// the server doesn't know which one is creating the campaign. Backing off a day
// accepts anyone's real today and rejects only dates that are past everywhere.
function earliestAllowedStart(): Date {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  today.setUTCDate(today.getUTCDate() - 1);
  return today;
}

const baseCampaignSchema = z.object({
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(50, "Title must be 50 characters or fewer"),
  platforms: z.array(platformEnum).min(1, "Select at least one platform"),
  payoutPer1kViewsCents: z.coerce
    .number()
    .int()
    .positive("Payout must be a positive amount"),
  totalBudgetCents: z.coerce
    .number()
    .int()
    .positive("Budget must be a positive amount"),
  status: campaignStatusEnum.default("draft"),
  startsAt: campaignDate,
  endsAt: campaignDate,
});

type CampaignFields = z.infer<typeof baseCampaignSchema>;

const endAfterStart = (data: CampaignFields) => data.endsAt > data.startsAt;
const payoutWithinBudget = (data: CampaignFields) =>
  data.payoutPer1kViewsCents <= data.totalBudgetCents;

// Shared by create and edit. Applied per schema rather than on a common base,
// because .refine() returns an effect that can't be extended further.
const endAfterStartRule = {
  message: "End date must be after the start date",
  path: ["endsAt" as const],
};
const payoutWithinBudgetRule = {
  message: "Payout cannot exceed the total budget",
  path: ["payoutPer1kViewsCents" as const],
};

// New campaigns must start today or later; editing leaves the start date
// alone, since an already-running campaign still has to be editable.
export const campaignFormSchema = baseCampaignSchema
  .refine((data) => data.startsAt >= earliestAllowedStart(), {
    message: "Start date cannot be in the past",
    path: ["startsAt"],
  })
  .refine(endAfterStart, endAfterStartRule)
  .refine(payoutWithinBudget, payoutWithinBudgetRule);

export const campaignUpdateSchema = baseCampaignSchema
  .refine(endAfterStart, endAfterStartRule)
  .refine(payoutWithinBudget, payoutWithinBudgetRule);

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusEnum>;
