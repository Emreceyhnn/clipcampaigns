"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";
import type { CampaignStatus } from "@/lib/validations/campaign";

// Radix Select has no empty-string value, so "all" stands in for no filter.
const ALL_STATUSES = "all";

// Spend approaching the cap is the thing an admin needs to notice, so the bar
// shifts colour before it gets there.
function BudgetUsage({
  spentCents,
  totalCents,
}: {
  spentCents: number;
  totalCents: number;
}) {
  const percent = totalCents > 0 ? (spentCents / totalCents) * 100 : 0;
  const tone =
    percent >= 100
      ? "bg-destructive"
      : percent >= 80
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <span className="font-medium">{formatCents(spentCents)}</span>
        <span className="text-muted-foreground">of {formatCents(totalCents)}</span>
      </div>
      <Progress value={percent} indicatorClassName={tone} />
      <div className="text-[11px] tabular-nums text-muted-foreground">
        {percent.toFixed(0)}% used
      </div>
    </div>
  );
}

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  completed: "secondary",
};

export function AdminCampaignsView() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<CampaignStatus | undefined>(undefined);

  // Debounced so typing a title is one query, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const { data, isLoading } = trpc.campaign.list.useQuery(
    {
      page,
      pageSize: 10,
      search: debouncedSearch || undefined,
      status,
    },
    { placeholderData: (previous) => previous }
  );

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 10));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Manage clip campaigns and review submissions
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/campaigns/new">New campaign</Link>
        </Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search campaigns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={100}
          className="max-w-xs"
        />
        <Select
          value={status ?? ALL_STATUSES}
          onValueChange={(value) =>
            setStatus(value === ALL_STATUSES ? undefined : (value as CampaignStatus))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Platforms</TableHead>
            <TableHead>Payout / 1k views</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No campaigns
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell className="max-w-56 font-medium">
                <Link
                  href={`/admin/campaigns/${campaign.id}`}
                  className="block overflow-hidden text-ellipsis hover:underline"
                  title={campaign.title}
                >
                  {campaign.title}
                </Link>
              </TableCell>
              <TableCell>{campaign.platforms.join(", ")}</TableCell>
              <TableCell>{formatCents(campaign.payoutPer1kViewsCents)}</TableCell>
              <TableCell className="w-56">
                <BudgetUsage
                  spentCents={campaign.budgetSpentCents}
                  totalCents={campaign.totalBudgetCents}
                />
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[campaign.status] ?? "outline"}>
                  {campaign.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/admin/campaigns/${campaign.id}/edit`}>Edit</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={page === 1}
              className={page === 1 ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => {
                e.preventDefault();
                setPage((p) => Math.max(1, p - 1));
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <span className="px-4 text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={page >= totalPages}
              className={
                page >= totalPages ? "pointer-events-none opacity-50" : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                setPage((p) => Math.min(totalPages, p + 1));
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
