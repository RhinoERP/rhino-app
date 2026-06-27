import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { SaleDetail } from "@/components/sales/detail/sale-detail";
import { getArcaSaleInvoiceReadiness } from "@/modules/arca/server/sale-invoicing.service";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import { getCreditNotesBySaleId } from "@/modules/credit-notes/service/credit-notes.service";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { getOrganizationSalesMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSaleReturnsSummary } from "@/modules/sales/service/sale-return.service";
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
  noStore();

  const { orgSlug, saleId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialMode =
    resolvedSearchParams?.modo === "devolucion" ? "return" : "default";
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canRead) {
    notFound();
  }

  const [
    sale,
    customers,
    sellers,
    taxes,
    products,
    categories,
    remittanceSettingsResult,
    saleReturns,
    creditNotes,
    arcaReadiness,
    organization,
  ] = await Promise.all([
    getSalesOrderById(orgSlug, saleId),
    getCustomersByOrgSlug(orgSlug),
    getOrganizationSalesMembersBySlug(orgSlug),
    getActiveTaxesByOrgSlug(orgSlug),
    getSaleProducts(orgSlug),
    getCategoriesByOrgSlug(orgSlug),
    getRemittanceSettings(orgSlug),
    getSaleReturnsSummary(orgSlug, saleId),
    getCreditNotesBySaleId(orgSlug, saleId),
    getArcaSaleInvoiceReadiness(orgSlug),
    getOrganizationBySlug(orgSlug),
  ]);

  if (!(sale && organization)) {
    notFound();
  }

  return (
    <SaleDetail
      arcaReadiness={arcaReadiness}
      creditNotes={creditNotes}
      customers={customers}
      initialCategories={categories}
      initialMode={initialMode}
      organizationName={organization.name}
      orgSlug={orgSlug}
      products={products}
      remittanceSettings={remittanceSettingsResult.data ?? null}
      sale={sale}
      saleReturns={saleReturns}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
