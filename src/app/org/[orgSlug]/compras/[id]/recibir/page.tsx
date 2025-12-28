import { notFound } from "next/navigation";
import { PurchaseReceipt } from "@/components/purchases/shared/purchase-receipt";
import { getPurchaseOrderWithItems } from "@/modules/purchases/service/purchases.service";

type PurchaseReceiptPageProps = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

export default async function PurchaseReceiptPage({
  params,
}: PurchaseReceiptPageProps) {
  const { orgSlug, id } = await params;

  try {
    const purchaseOrder = await getPurchaseOrderWithItems(orgSlug, id);

    if (purchaseOrder.status === "CANCELLED") {
      notFound();
    }

    return <PurchaseReceipt orgSlug={orgSlug} purchaseOrder={purchaseOrder} />;
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    notFound();
  }
}
