"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { reviewActionSchema, type ReviewActionValues } from "@/lib/validations/review";
import { trpc } from "@/lib/trpc/client";

type QueueItem = {
  id: string;
  postUrl: string;
  platform: string;
  creatorEmail: string;
  createdAt: Date | string;
  views: number;
  wouldExceedBudget: boolean;
};

export function ReviewQueue({ items, campaignId }: { items: QueueItem[]; campaignId: string }) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const reviewMutation = trpc.submission.review.useMutation({
    // Drop the row immediately. Approvals can still be refused server-side
    // (BUDGET_EXCEEDED), so onError restores the exact previous queue.
    onMutate: async ({ submissionId }) => {
      await utils.campaign.reviewQueue.cancel({ campaignId });
      const previous = utils.campaign.reviewQueue.getData({ campaignId });

      utils.campaign.reviewQueue.setData({ campaignId }, (old) =>
        old
          ? {
              ...old,
              submissions: old.submissions.filter((s) => s.id !== submissionId),
            }
          : old
      );

      setRejectingId(null);
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        utils.campaign.reviewQueue.setData({ campaignId }, context.previous);
      }

      const appErrorCode = (error.data as { appErrorCode?: string } | undefined)
        ?.appErrorCode;
      if (appErrorCode === "BUDGET_EXCEEDED") {
        toast.error("Budget exceeded — cannot approve this submission");
      } else {
        toast.error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Submission updated");
    },
    // Either way, resync the queue and the budget/views cards above it.
    onSettled: () => {
      void utils.campaign.reviewQueue.invalidate({ campaignId });
      void utils.campaign.overview.invalidate({ campaignId });
    },
  });

  const form = useForm<ReviewActionValues>({
    resolver: zodResolver(reviewActionSchema),
    defaultValues: { submissionId: "", action: "reject", rejectionReason: "" },
  });

  function handleApprove(submissionId: string) {
    reviewMutation.mutate({ submissionId, action: "approve" });
  }

  function openReject(submissionId: string) {
    form.reset({ submissionId, action: "reject", rejectionReason: "" });
    setRejectingId(submissionId);
  }

  function onRejectSubmit(values: ReviewActionValues) {
    reviewMutation.mutate(values);
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Creator</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Post URL</TableHead>
            <TableHead>Views</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No pending submissions
              </TableCell>
            </TableRow>
          )}
          {items.map((item) => (
            <TableRow
              key={item.id}
              className={
                item.wouldExceedBudget
                  ? "bg-destructive/10 hover:bg-destructive/15"
                  : undefined
              }
            >
              <TableCell
                className="max-w-48 overflow-hidden text-ellipsis"
                title={item.creatorEmail}
              >
                {item.creatorEmail}
              </TableCell>
              <TableCell>{item.platform}</TableCell>
              <TableCell className="max-w-xs truncate">
                <a href={item.postUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {item.postUrl}
                </a>
              </TableCell>
              <TableCell className="tabular-nums">
                <div className="flex items-center gap-2">
                  {item.views.toLocaleString()}
                  {item.wouldExceedBudget && (
                    <Badge variant="destructive">Exceeds budget</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button size="sm" onClick={() => handleApprove(item.id)}>
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openReject(item.id)}>
                  Reject
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onRejectSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="rejectionReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this submission was rejected"
                        minLength={1}
                        maxLength={500}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" variant="destructive">
                  Confirm rejection
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
