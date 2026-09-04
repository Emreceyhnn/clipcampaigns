import "server-only";

import { cache } from "react";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/context";
import { makeQueryClient } from "./query-client";

export const getQueryClient = cache(makeQueryClient);

export async function getServerHelpers() {
  const ctx = await createTRPCContext();
  return createServerSideHelpers({
    router: appRouter,
    ctx,
    queryClient: getQueryClient(),
  });
}
