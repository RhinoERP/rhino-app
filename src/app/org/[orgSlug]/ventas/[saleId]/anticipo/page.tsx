import { notFound } from "next/navigation";
import { SalesAdvanceWorkspace } from "@/components/sales/detail/sales-advance-workspace";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesAccessContext,
  getSalesOrderById,
} from "@/modules/sales/service/sales.service";
import {
  getSalesAdvanceByFinalSaleId,
  getSalesAdvanceById,
} from "@/modules/sales-advances/service/sales-advances.service";

type SalesAdvancePageProps = {
  params: Promise<{ orgSlug: string; saleId: string }>;
  searchParams: Promise<{ advanceId?: string }>;
};

export const dynamic = "force-dynamic";

export default async function SalesAdvancePage({
  params,
  searchParams,
}: SalesAdvancePageProps) {
  const { orgSlug, saleId } = await params;
  const { advanceId } = await searchParams;
  const [org, access] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getSalesAccessContext(orgSlug),
  ]);
  if (!org || org.sales_advances_enabled === false || !access.canRead) {
    notFound();
  }

  const [sale, advance] = await Promise.all([
    getSalesOrderById(orgSlug, saleId),
    advanceId
      ? getSalesAdvanceById({ orgSlug, advanceId })
      : getSalesAdvanceByFinalSaleId({ orgSlug, finalSalesOrderId: saleId }),
  ]);
  if (!(sale && advance) || advance.finalSalesOrderId !== saleId) {
    notFound();
  }

  return (
    <SalesAdvanceWorkspace
      advanceId={advance.id}
      canManage={sale.access.canManage}
      initialAdvance={advance}
      orgSlug={orgSlug}
      sale={{
        id: sale.id,
        saleNumber: sale.sale_number ?? null,
        invoiceNumber: sale.invoice_number ?? null,
        totalAmount: sale.total_amount,
        currency: sale.currency ?? "ARS",
        customerName: sale.customer.fantasy_name ?? sale.customer.business_name,
      }}
    />
  );
}
