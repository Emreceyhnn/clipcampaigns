"use client";

import { Info } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
  paid: "secondary",
};

export function MySubmissionsView() {
  const { data, isLoading } = trpc.submission.mine.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My submissions</h1>
        <p className="text-sm text-muted-foreground">
          Track review status, views, and estimated earnings
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Views</TableHead>
            <TableHead>Est. earnings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No submissions
              </TableCell>
            </TableRow>
          )}
          {data?.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell
                className="max-w-56 overflow-hidden text-ellipsis"
                title={submission.campaignTitle}
              >
                {submission.campaignTitle}
              </TableCell>
              <TableCell>{submission.platform}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Badge variant={statusVariant[submission.status] ?? "outline"}>
                    {submission.status}
                  </Badge>
                  {submission.status === "rejected" && submission.rejectionReason && (
                    <span title={submission.rejectionReason}>
                      <Info className="size-3.5 shrink-0 text-muted-foreground" />
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>{submission.views.toLocaleString()}</TableCell>
              <TableCell>
                {formatCents(submission.estimatedEarningsCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
