import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthErrorToast } from "./auth-error-toast";
import { UserSwitcher } from "./user-switcher";

const mockUsers = [
  { email: "admin@example.com", label: "Admin (Alex)" },
  { email: "creator@example.com", label: "Creator (Casey)" },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 p-8">
      <Suspense fallback={null}>
        <AuthErrorToast />
      </Suspense>
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Clip Campaigns</h1>
        <p className="text-muted-foreground">
          Creator payout platform take-home skeleton
        </p>
      </div>

      <div className="grid w-full gap-6 sm:grid-cols-2">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Admin dashboard</CardTitle>
            <CardDescription>
              Manage campaigns, review submissions, track budget
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button asChild className="w-full">
              <Link href="/admin" prefetch>
                Go to admin
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Creator dashboard</CardTitle>
            <CardDescription>
              Browse campaigns, submit clips, track earnings
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button asChild className="w-full" variant="outline">
              <Link href="/creator" prefetch>
                Go to creator
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Dev-only user switcher</CardTitle>
          <CardDescription>
            Sets a mock userEmail cookie read by the tRPC context stub
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserSwitcher users={mockUsers} />
        </CardContent>
      </Card>
    </div>
  );
}
