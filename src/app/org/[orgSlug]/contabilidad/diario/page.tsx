import { notFound } from "next/navigation";
import { LibroDiario } from "@/components/accounting/libro-diario";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function DiarioPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <LibroDiario orgId={org.id} orgSlug={orgSlug} />;
}
