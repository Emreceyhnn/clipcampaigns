"use server";

import { cookies } from "next/headers";

export async function switchUser(email: string) {
  const cookieStore = await cookies();
  cookieStore.set("userEmail", email, { path: "/" });
}
