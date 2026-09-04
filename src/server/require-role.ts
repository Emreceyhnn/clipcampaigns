import "server-only";

import { redirect } from "next/navigation";

import { createTRPCContext } from "./context";
import type { Role } from "./trpc";

// Layouts render before any tRPC query throws, so a stale or wrong-role
// userEmail cookie has to be caught here rather than left to the procedures.
export async function requireRole(role: Role) {
  const ctx = await createTRPCContext();

  if (!ctx.userId || ctx.role !== role) {
    redirect("/?authError=1");
  }
}
