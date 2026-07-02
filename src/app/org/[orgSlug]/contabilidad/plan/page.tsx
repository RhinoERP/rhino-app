import { notFound } from "next/navigation";
import { PlanCuentasPage } from "@/components/accounting/plan-cuentas-page";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function PlanPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return <PlanCuentasPage orgId={org.id} />;
}
