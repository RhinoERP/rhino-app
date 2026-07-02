import { notFound } from "next/navigation";
import { LibroMayor } from "@/components/accounting/libro-mayor";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function MayorPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <LibroMayor orgId={org.id} />;
}
