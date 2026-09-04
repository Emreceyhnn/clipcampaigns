"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  campaignFormSchema,
  campaignUpdateSchema,
  type CampaignFormValues,
} from "@/lib/validations/campaign";
import { formatCents } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";

const platformOptions = ["tiktok", "instagram", "youtube"] as const;

type CampaignFormInput = z.input<typeof campaignFormSchema>;

// Stored dates are UTC midnight and arrive as a Date or an ISO string; read
// UTC fields so the day does not shift.
function toDateInput(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${value.getUTCFullYear()}-${month}-${day}`;
  }
  return "";
}

function todayDateInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function addDaysToDateInput(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return toDateInput(d);
}

export function CampaignForm({
  campaignId,
  defaultValues,
  onSubmitLabel = "Create campaign",
}: {
  campaignId?: string;
  // No Date transformer on the tRPC link, so these arrive as ISO strings.
  defaultValues?: Partial<Omit<CampaignFormValues, "startsAt" | "endsAt">> & {
    startsAt?: Date | string;
    endsAt?: Date | string;
  };
  onSubmitLabel?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Only new campaigns are held to "today or later"; a running campaign has to
  // stay editable without moving its start date.
  const isEditing = Boolean(campaignId);
  const earliestStart = isEditing ? undefined : todayDateInput();

  const form = useForm<CampaignFormInput>({
    // raw: true keeps the dates as typed. The parsed output would hand back
    // Dates, which serialize as ISO timestamps the server rejects.
    resolver: zodResolver(
      isEditing ? campaignUpdateSchema : campaignFormSchema,
      undefined,
      { raw: true }
    ),
    defaultValues: {
      title: "",
      platforms: [],
      payoutPer1kViewsCents: 0,
      totalBudgetCents: 0,
      status: "draft",
      startsAt: todayDateInput(),
      endsAt: addDaysToDateInput(todayDateInput(), 1),
      ...defaultValues,
    },
  });

  const startsAt = toDateInput(form.watch("startsAt"));
  const earliestEnd = startsAt ? addDaysToDateInput(startsAt, 1) : undefined;

  // Moving the start past the end has to surface on the end field right away.
  useEffect(() => {
    if (form.formState.isSubmitted || form.getFieldState("endsAt").isDirty) {
      void form.trigger("endsAt");
    }
  }, [startsAt, form]);

  async function onSaved(message: string) {
    toast.success(message);
    await utils.campaign.list.invalidate();
    if (campaignId) await utils.campaign.byId.invalidate({ id: campaignId });
    router.push("/admin");
  }

  const onError = (error: { message: string }) => toast.error(error.message);

  const createMutation = trpc.campaign.create.useMutation({
    onSuccess: () => onSaved("Campaign created"),
    onError,
  });

  const updateMutation = trpc.campaign.update.useMutation({
    onSuccess: () => onSaved("Campaign saved"),
    onError,
  });

  function onSubmit(values: CampaignFormInput) {
    if (campaignId) {
      updateMutation.mutate({ id: campaignId, ...values });
    } else {
      createMutation.mutate(values);
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input
                  placeholder="Summer Launch Clips"
                  minLength={2}
                  maxLength={50}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="platforms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Platforms</FormLabel>
              <div className="flex gap-4">
                {platformOptions.map((platform) => (
                  <label key={platform} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value?.includes(platform)}
                      onCheckedChange={(checked) => {
                        const current = field.value ?? [];
                        field.onChange(
                          checked
                            ? [...current, platform]
                            : current.filter((p) => p !== platform)
                        );
                      }}
                    />
                    {platform}
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["payoutPer1kViewsCents", "Payout / 1k views"],
              ["totalBudgetCents", "Total budget"],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-baseline justify-between gap-2">
                    <FormLabel>{label} (cents)</FormLabel>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {formatCents(Number(field.value) || 0)}
                    </span>
                  </div>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      maxLength={12}
                      {...field}
                      // Strip leading zeros, but allow an empty field mid-edit.
                      value={(field.value as number | string) ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, "");
                        if (raw !== e.target.value) {
                          e.target.value = raw;
                        }
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["startsAt", "Starts at"],
              ["endsAt", "Ends at"],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="date"
                        className="pr-9"
                        min={name === "endsAt" ? earliestEnd : earliestStart}
                        value={toDateInput(field.value)}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                      <CalendarIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : onSubmitLabel}
        </Button>
      </form>
    </Form>
  );
}
