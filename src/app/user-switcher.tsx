"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { switchUser } from "./actions";

export function UserSwitcher({
  users,
}: {
  users: { email: string; label: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSwitch(email: string, label: string) {
    startTransition(async () => {
      await switchUser(email);
      toast.success(`Switched to ${label}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-3">
      {users.map((user) => (
        <Button
          key={user.email}
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => handleSwitch(user.email, user.label)}
        >
          Switch to {user.label}
        </Button>
      ))}
    </div>
  );
}
