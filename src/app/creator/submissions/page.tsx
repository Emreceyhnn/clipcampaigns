import { HydrationBoundary } from "@tanstack/react-query";

import { getServerHelpers } from "@/lib/trpc/server";
import { MySubmissionsView } from "./my-submissions-view";

export default async function MySubmissionsPage() {
  const helpers = await getServerHelpers();
  await helpers.submission.mine.prefetch();

  return (
    <HydrationBoundary state={helpers.dehydrate()}>
      <MySubmissionsView />
    </HydrationBoundary>
  );
}
