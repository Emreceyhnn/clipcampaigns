"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  detectPlatformFromUrl,
  submissionFormSchema,
  type SubmissionFormValues,
} from "@/lib/validations/submission";
import { trpc } from "@/lib/trpc/client";

const platformLabels: Record<SubmissionFormValues["platform"], string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export function SubmitClipDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<SubmissionFormValues>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: { campaignId, platform: "tiktok", postUrl: "" },
  });

  const utils = trpc.useUtils();
  const createMutation = trpc.submission.create.useMutation({
    onSuccess: async () => {
      toast.success("Clip submitted for review");
      setOpen(false);
      form.reset();
      await utils.submission.mine.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  function onSubmit(values: SubmissionFormValues) {
    createMutation.mutate(values);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Submit clip</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit a clip</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform</FormLabel>
                  <Select value={field.value} disabled>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>{platformLabels[field.value]}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Detected automatically from the post URL
                  </p>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Post URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://www.tiktok.com/@you/video/123"
                      minLength={1}
                      maxLength={2048}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        // Platform is derived from the URL, so it updates on every change.
                        const detected = detectPlatformFromUrl(e.target.value);
                        form.setValue("platform", detected ?? "tiktok", {
                          shouldValidate: form.formState.isSubmitted,
                        });
                        void form.trigger("postUrl");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Submit for review</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
