import { ArcaOperatorProfilesClient } from "@/components/admin/arca-operator-profiles-client";
import { getArcaOperatorProfilesSummary } from "@/modules/arca/server/operator-profiles.service";

export default async function AdminArcaPage() {
  const profiles = await getArcaOperatorProfilesSummary();

  return <ArcaOperatorProfilesClient initialProfiles={profiles} />;
}
