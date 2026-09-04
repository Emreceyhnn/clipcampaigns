"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitClipDialog } from "@/components/submissions/submit-clip-dialog";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

export function CreatorBrowseView() {
  const { data: campaigns, isLoading } = trpc.campaign.listActive.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Active campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Browse open campaigns and submit your clips for review
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <p className="text-muted-foreground">Loading campaigns...</p>
        )}
        {!isLoading && campaigns?.length === 0 && (
          <p className="text-muted-foreground">No active campaigns right now.</p>
        )}
        {campaigns?.map((campaign) => (
          <Card key={campaign.id} className="min-w-0">
            <CardHeader>
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <CardTitle
                  className="min-w-0 truncate text-base"
                  title={campaign.title}
                >
                  {campaign.title}
                </CardTitle>
                <Badge className="shrink-0">{campaign.status}</Badge>
              </div>
              <CardDescription>
                {campaign.platforms.join(", ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {formatCents(campaign.payoutPer1kViewsCents)} per 1,000 views
            </CardContent>
            <CardFooter>
              <SubmitClipDialog campaignId={campaign.id} />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
