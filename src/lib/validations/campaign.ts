import { z } from "zod";

export const platformEnum = z.enum(["tiktok", "instagram", "youtube"]);

export const campaignStatusEnum = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
]);

// Campaign dates are calendar days, not instants. A Date sent over the wire
// serializes as a UTC instant and can shift the day; a YYYY-MM-DD string can't.
const dateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
  .transform((value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  });

// Also accepts a Date so seed scripts and tests can pass one directly.
const campaignDate = z.union([dateOnlyString, z.date()]);

// One day of slack, so the check accepts anyone's real today regardless of
// their time zone and rejects only days that are past everywhere.
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

// Applied per schema rather than on the base, since .refine() returns an
// effect that can't be extended further.
const endAfterStartRule = {
  message: "End date must be after the start date",
  path: ["endsAt" as const],
};
const payoutWithinBudgetRule = {
  message: "Payout cannot exceed the total budget",
  path: ["payoutPer1kViewsCents" as const],
};

// New campaigns must start today or later; editing leaves the start date alone.
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
