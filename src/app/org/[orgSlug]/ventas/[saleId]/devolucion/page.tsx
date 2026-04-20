import { notFound } from "next/navigation";
import { SaleReturnForm } from "@/components/sales/return/sale-return-form";
import { getReturnedQuantitiesBySaleId } from "@/modules/sales/service/sale-return.service";
import {
  getSalesAccessContext,
  getSalesOrderById,
} from "@/modules/sales/service/sales.service";

type PageParams = { orgSlug: string; saleId: string };

export const dynamic = "force-dynamic";

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { orgSlug, saleId } = await params;

  const accessContext = await getSalesAccessContext(orgSlug);
  if (!accessContext.canManage) {
    notFound();
  }

  const [sale, returnedQuantities] = await Promise.all([
    getSalesOrderById(orgSlug, saleId),
    getReturnedQuantitiesBySaleId(orgSlug, saleId),
  ]);

  if (!sale) {
    notFound();
  }

  if (sale.status !== "DISPATCH" && sale.status !== "DELIVERED") {
    notFound();
  }

  return (
    <SaleReturnForm
      orgSlug={orgSlug}
      returnedQuantities={returnedQuantities}
      sale={sale}
    />
  );
}
