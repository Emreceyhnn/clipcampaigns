"use client";

import { CampaignForm } from "@/components/campaigns/campaign-form";
import { trpc } from "@/lib/trpc/client";

type CampaignFormPlatforms = ("tiktok" | "instagram" | "youtube")[];

export function EditCampaignView({ id }: { id: string }) {
  const { data: campaign, isLoading } = trpc.campaign.byId.useQuery({ id });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit campaign</h1>
      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      {campaign && (
        <CampaignForm
          campaignId={campaign.id}
          onSubmitLabel="Save changes"
          defaultValues={{
            title: campaign.title,
            platforms: campaign.platforms as CampaignFormPlatforms,
            payoutPer1kViewsCents: campaign.payoutPer1kViewsCents,
            totalBudgetCents: campaign.totalBudgetCents,
            status: campaign.status,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
          }}
        />
      )}
    </div>
  );
}
