import { notFound } from "next/navigation";
import { SalesAdvanceWorkspace } from "@/components/sales/detail/sales-advance-workspace";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesAccessContext,
  getSalesOrderById,
} from "@/modules/sales/service/sales.service";
import { getSalesAdvanceByFinalSaleId } from "@/modules/sales-advances/service/sales-advances.service";

type SalesAdvancePageProps = {
  params: Promise<{ orgSlug: string; saleId: string }>;
};

export const dynamic = "force-dynamic";

export default async function SalesAdvancePage({
  params,
}: SalesAdvancePageProps) {
  const { orgSlug, saleId } = await params;
  const [org, access] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getSalesAccessContext(orgSlug),
  ]);
  if (!org || org.sales_advances_enabled === false || !access.canRead) {
    notFound();
  }

  const [sale, advance] = await Promise.all([
    getSalesOrderById(orgSlug, saleId),
    getSalesAdvanceByFinalSaleId({ orgSlug, finalSalesOrderId: saleId }),
  ]);
  if (!(sale && advance)) {
    notFound();
  }

  return (
    <SalesAdvanceWorkspace
      canManage={sale.access.canManage}
      initialAdvance={advance}
      orgSlug={orgSlug}
      sale={{
        id: sale.id,
        saleNumber: sale.sale_number ?? null,
        invoiceNumber: sale.invoice_number ?? null,
        totalAmount: sale.total_amount,
        customerName: sale.customer.fantasy_name ?? sale.customer.business_name,
      }}
    />
  );
}
