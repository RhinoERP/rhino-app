import { redirect } from "next/navigation";
import { SupplierCommissionRatesGrid } from "@/components/commissions/supplier-commission-rates-grid";
import { getSupplierCommissionRatesByOrg } from "@/modules/commissions/service/supplier-commission-rates.service";
import { getOrganizationSalesMembersBySlug } from "@/modules/organizations/service/members.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";

type SupplierCommissionRatesPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function SupplierCommissionRatesPage({
  params,
}: SupplierCommissionRatesPageProps) {
  const { orgSlug } = await params;

  const org = await getOrganizationBySlug(orgSlug);

  if (!isOrganizationModuleEnabled(org, "commissions")) {
    redirect(`/org/${orgSlug}`);
  }

  if (org?.supplier_differentiated_credits !== true) {
    redirect(`/org/${orgSlug}/comisiones`);
  }

  await guardOrganizationPermissionAccess(
    orgSlug,
    READ_PERMISSIONS.commissions
  );

  const [members, suppliers, rates] = await Promise.all([
    getOrganizationSalesMembersBySlug(orgSlug),
    getSuppliersByOrgSlug(orgSlug),
    getSupplierCommissionRatesByOrg(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Comisiones por proveedor</h1>
        <p className="text-muted-foreground text-sm">
          Configurá la comisión adicional de cada vendedor según el proveedor.
          Se suma a la comisión base y al ajuste del nivel de lista.
        </p>
      </div>
      <SupplierCommissionRatesGrid
        members={members}
        orgSlug={orgSlug}
        rates={rates}
        suppliers={suppliers.filter((s) => s.is_active)}
      />
    </div>
  );
}
