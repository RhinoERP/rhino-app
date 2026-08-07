import { notFound } from "next/navigation";
import { ChartOfAccountsTree } from "@/components/accounting/chart-of-accounts-tree";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function PlanPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    notFound();
  }

  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="font-semibold text-2xl">Plan de Cuentas</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Gestión del plan de cuentas contables de la organización
        </p>
      </div>
      <ChartOfAccountsTree orgId={org.id} orgSlug={orgSlug} />
    </div>
  );
}
