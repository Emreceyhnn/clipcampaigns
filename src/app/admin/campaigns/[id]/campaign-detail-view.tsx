"use client";

import dynamic from "next/dynamic";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReviewQueue } from "@/components/submissions/review-queue";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

const DailyViewsChart = dynamic(() => import("./daily-views-chart"), {
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading chart...
    </div>
  ),
});

export function CampaignDetailView({ id }: { id: string }) {
  const overview = trpc.campaign.overview.useQuery({ campaignId: id });
  const reviewQueue = trpc.campaign.reviewQueue.useQuery({ campaignId: id });

  const data = overview.data;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Campaign detail</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Approved views</CardDescription>
            <CardTitle className="text-2xl">
              {data?.approvedViews.toLocaleString() ?? "-"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Budget spent</CardDescription>
            <CardTitle className="text-2xl">
              {data ? formatCents(data.budgetSpentCents) : "-"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Budget left</CardDescription>
            <CardTitle className="text-2xl">
              {data ? formatCents(data.budgetLeftCents) : "-"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily views</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <DailyViewsChart data={data?.dailyViews ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>Pending submissions awaiting approval</CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewQueue campaignId={id} items={reviewQueue.data?.submissions ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
