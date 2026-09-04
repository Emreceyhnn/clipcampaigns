"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Landing page redirect target for requireRole(): shows why the visitor got
// bounced back here, then strips the query param so a refresh doesn't
// re-fire the toast.
export function AuthErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("authError") !== "1") return;

    toast.error("You don't have access to that page. Switch to a valid user below.");
    router.replace("/");
  }, [searchParams, router]);

  return null;
}
