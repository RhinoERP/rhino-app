import { notFound } from "next/navigation";
import { InformalEntryDetail } from "@/components/accounting/informal-entry-detail";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string; id: string }> };

export default async function InformalEntryDetailPage({ params }: Props) {
  const { orgSlug, id } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <InformalEntryDetail entryId={id} orgId={org.id} orgSlug={orgSlug} />;
}
