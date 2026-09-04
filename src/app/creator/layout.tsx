import Link from "next/link";

import { requireRole } from "@/server/require-role";

export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("creator");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/creator" className="font-semibold">
            Clip Campaigns / Creator
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/creator">Browse campaigns</Link>
            <Link href="/creator/submissions">My submissions</Link>
            <Link href="/">Switch role</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
