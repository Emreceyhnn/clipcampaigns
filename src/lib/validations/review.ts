import { z } from "zod";

export const reviewActionSchema = z
  .object({
    submissionId: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    rejectionReason: z
      .string()
      .min(1)
      .max(500, "Rejection reason must be 500 characters or fewer")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "reject" && !data.rejectionReason) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectionReason"],
        message: "A rejection reason is required when rejecting",
      });
    }
  });

export type ReviewActionValues = z.infer<typeof reviewActionSchema>;
