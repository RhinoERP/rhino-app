import { ChartOfAccountsTree } from "@/components/accounting/chart-of-accounts-tree";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function PlanDeCuentasPage({ params }: Props) {
  const { orgSlug } = await params;

  await guardOrganizationModuleAccess(orgSlug, "accounting");

  const org = await getOrganizationBySlug(orgSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Plan de Cuentas</h1>
        <p className="text-muted-foreground text-sm">
          Gestión del plan de cuentas contable de la organización.
        </p>
      </div>

      <ChartOfAccountsTree orgId={org?.id ?? ""} orgSlug={orgSlug} />
    </div>
  );
}
