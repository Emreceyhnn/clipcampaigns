import { router } from "../trpc";
import { campaignRouter } from "./campaign";
import { submissionRouter } from "./submission";

export const appRouter = router({
  campaign: campaignRouter,
  submission: submissionRouter,
});

export type AppRouter = typeof appRouter;
