import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { SaleDetail } from "@/components/sales/detail/sale-detail";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { getOrganizationSalesMembersBySlug } from "@/modules/organizations/service/members.service";
import {
  getSaleProducts,
  getSalesAccessContext,
  getSalesOrderById,
} from "@/modules/sales/service/sales.service";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type SaleDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    saleId: string;
  }>;
  searchParams?: Promise<{
    modo?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SaleDetailPage({
  params,
  searchParams,
}: SaleDetailPageProps) {
  // Fuerza a no cachear la carga del detalle.
  noStore();

  const { orgSlug, saleId } = await params;
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canRead) {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialMode =
    resolvedSearchParams?.modo === "devolucion" ? "return" : "default";

  const [sale, customers, sellers, taxes, products, remittanceSettingsResult] =
    await Promise.all([
      getSalesOrderById(orgSlug, saleId),
      getCustomersByOrgSlug(orgSlug),
      getOrganizationSalesMembersBySlug(orgSlug),
      getActiveTaxesByOrgSlug(orgSlug),
      getSaleProducts(orgSlug),
      getRemittanceSettings(orgSlug),
    ]);

  if (!sale) {
    notFound();
  }

  return (
    <SaleDetail
      customers={customers}
      initialMode={initialMode}
      orgSlug={orgSlug}
      products={products}
      remittanceSettings={remittanceSettingsResult.data ?? null}
      sale={sale}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
