import { notFound } from "next/navigation";
import { LibroIIBB } from "@/components/accounting/libro-iibb";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function IIBBPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <LibroIIBB orgId={org.id} />;
}
