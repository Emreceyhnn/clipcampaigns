import { HydrationBoundary } from "@tanstack/react-query";

import { getServerHelpers } from "@/lib/trpc/server";
import { CreatorBrowseView } from "./creator-browse-view";

export default async function CreatorBrowsePage() {
  const helpers = await getServerHelpers();
  await helpers.campaign.listActive.prefetch();

  return (
    <HydrationBoundary state={helpers.dehydrate()}>
      <CreatorBrowseView />
    </HydrationBoundary>
  );
}
