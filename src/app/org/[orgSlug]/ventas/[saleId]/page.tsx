import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { SaleDetail } from "@/components/sales/sale-detail";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import {
  getSaleProducts,
  getSalesOrderById,
} from "@/modules/sales/service/sales.service";
import { getActiveTaxes } from "@/modules/taxes/service/taxes.service";

type SaleDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    saleId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  // Fuerza a no cachear la carga del detalle.
  noStore();

  const { orgSlug, saleId } = await params;

  const [sale, customers, sellers, taxes, products] = await Promise.all([
    getSalesOrderById(orgSlug, saleId),
    getCustomersByOrgSlug(orgSlug),
    getOrganizationMembersBySlug(orgSlug),
    getActiveTaxes(),
    getSaleProducts(orgSlug),
  ]);

  if (!sale) {
    notFound();
  }

  return (
    <SaleDetail
      customers={customers}
      orgSlug={orgSlug}
      products={products}
      sale={sale}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
