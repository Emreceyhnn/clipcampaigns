import Link from "next/link";

import { requireRole } from "@/server/require-role";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="font-semibold">
            Clip Campaigns / Admin
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/admin">Campaigns</Link>
            <Link href="/">Switch role</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
