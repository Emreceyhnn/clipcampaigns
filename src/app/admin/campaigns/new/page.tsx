import { CampaignForm } from "@/components/campaigns/campaign-form";

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New campaign</h1>
      <CampaignForm onSubmitLabel="Create campaign" />
    </div>
  );
}
