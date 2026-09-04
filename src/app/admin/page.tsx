import { HydrationBoundary } from "@tanstack/react-query";

import { getServerHelpers } from "@/lib/trpc/server";
import { AdminCampaignsView } from "./admin-campaigns-view";

export default async function AdminCampaignsPage() {
  const helpers = await getServerHelpers();
  await helpers.campaign.list.prefetch({ page: 1, pageSize: 10 });

  return (
    <HydrationBoundary state={helpers.dehydrate()}>
      <AdminCampaignsView />
    </HydrationBoundary>
  );
}
