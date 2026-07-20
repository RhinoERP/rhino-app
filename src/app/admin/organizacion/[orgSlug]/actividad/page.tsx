import { OrgActivityCard } from "@/components/admin/org-activity-card";
import { getOrgActivityMetrics } from "@/modules/admin/service/activity.service";

export default async function OrgActivityPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const activity = await getOrgActivityMetrics(orgSlug);

  return (
    <div className="space-y-6">
      <OrgActivityCard metrics={activity} />
    </div>
  );
}
