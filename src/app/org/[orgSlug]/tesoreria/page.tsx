import { notFound } from "next/navigation";
import { TreasuryPage } from "@/components/treasury/treasury-page";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function TesoreriaPage({ params }: Props) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, "treasury.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <TreasuryPage orgId={org.id} orgSlug={orgSlug} />;
}
