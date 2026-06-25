import { notFound } from "next/navigation";
import { AsientosPendientes } from "@/components/accounting/asientos-pendientes";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function PendientesPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <AsientosPendientes orgId={org.id} />;
}
