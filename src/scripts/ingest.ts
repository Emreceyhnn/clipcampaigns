import "dotenv/config";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { submissionMetrics, submissions } from "@/server/db/schema";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomIncrement(): number {
  return Math.floor(Math.random() * 5000) + 100;
}

function randomBaseViews(): number {
  return Math.floor(Math.random() * 2000);
}

async function ingestSubmission(submissionId: string) {
  const today = todayDateString();

  const [previous] = await db
    .select()
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(desc(submissionMetrics.capturedAt))
    .limit(1);

  const previousViews = previous?.views ?? randomBaseViews();
  const nextViews =
    previous && previous.capturedAt === today
      ? previous.views
      : previousViews + randomIncrement();

  const metrics = {
    views: nextViews,
    likes: Math.floor(nextViews * 0.05),
    comments: Math.floor(nextViews * 0.01),
  };

  // Re-running on the same day updates that day's row instead of adding a
  // second one, which is what makes the job safe to run repeatedly.
  await db
    .insert(submissionMetrics)
    .values({ submissionId, capturedAt: today, ...metrics })
    .onConflictDoUpdate({
      target: [submissionMetrics.submissionId, submissionMetrics.capturedAt],
      set: metrics,
    });

  return { submissionId, views: nextViews };
}

async function main() {
  const approvedSubmissions = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.status, "approved"));

  // One failing submission must not stop the rest of the run.
  const results = await Promise.allSettled(
    approvedSubmissions.map(async (submission) => {
      try {
        return await ingestSubmission(submission.id);
      } catch (error) {
        throw new Error(
          `Failed to ingest metrics for submission ${submission.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  const succeeded = results.length - failed.length;

  console.log(
    `Ingest complete: ${succeeded} succeeded, ${failed.length} failed out of ${results.length}`
  );

  for (const failure of failed) {
    console.error(failure.reason);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

// The postgres client keeps the event loop alive, so exit explicitly.
main()
  .catch((error) => {
    console.error("Ingest script crashed:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
