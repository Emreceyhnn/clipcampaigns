import { HydrationBoundary } from "@tanstack/react-query";

import { getServerHelpers } from "@/lib/trpc/server";
import { CampaignDetailView } from "./campaign-detail-view";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const helpers = await getServerHelpers();
  await Promise.all([
    helpers.campaign.overview.prefetch({ campaignId: id }),
    helpers.campaign.reviewQueue.prefetch({ campaignId: id }),
  ]);

  return (
    <HydrationBoundary state={helpers.dehydrate()}>
      <CampaignDetailView id={id} />
    </HydrationBoundary>
  );
}
