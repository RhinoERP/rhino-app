import { notFound } from "next/navigation";
import { LibroIVA } from "@/components/accounting/libro-iva";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function IVAPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <LibroIVA orgId={org.id} />;
}
