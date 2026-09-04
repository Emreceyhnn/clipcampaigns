import { HydrationBoundary } from "@tanstack/react-query";

import { getServerHelpers } from "@/lib/trpc/server";
import { EditCampaignView } from "./edit-campaign-view";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const helpers = await getServerHelpers();
  await helpers.campaign.byId.prefetch({ id });

  return (
    <HydrationBoundary state={helpers.dehydrate()}>
      <EditCampaignView id={id} />
    </HydrationBoundary>
  );
}
