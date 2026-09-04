import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { users } from "./db/schema";

export async function createTRPCContext() {
  const cookieStore = await cookies();
  const email = cookieStore.get("userEmail")?.value ?? null;

  const user = email
    ? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null
    : null;

  return {
    userId: user?.id ?? null,
    role: user?.role ?? null,
  };
}
