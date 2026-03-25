import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { SaleDetail } from "@/components/sales/detail/sale-detail";
import { getArcaSaleInvoiceReadiness } from "@/modules/arca/server/sale-invoicing.service";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import {
  getSaleProducts,
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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialMode =
    resolvedSearchParams?.modo === "devolucion" ? "return" : "default";

  const [sale, customers, sellers, taxes, products, arcaReadiness] =
    await Promise.all([
      getSalesOrderById(orgSlug, saleId),
      getCustomersByOrgSlug(orgSlug),
      getOrganizationMembersBySlug(orgSlug),
      getActiveTaxesByOrgSlug(orgSlug),
      getSaleProducts(orgSlug),
      getArcaSaleInvoiceReadiness(orgSlug),
    ]);

  if (!sale) {
    notFound();
  }

  return (
    <SaleDetail
      arcaReadiness={arcaReadiness}
      customers={customers}
      initialMode={initialMode}
      orgSlug={orgSlug}
      products={products}
      sale={sale}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
