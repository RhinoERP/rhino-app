import { notFound } from "next/navigation";
import { PurchaseReceipt } from "@/components/purchases/shared/purchase-receipt";
import { getPurchaseOrderWithItems } from "@/modules/purchases/service/purchases.service";
import { getAllTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

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
    const [purchaseOrder, allTaxes] = await Promise.all([
      getPurchaseOrderWithItems(orgSlug, id),
      getAllTaxesByOrgSlug(orgSlug),
    ]);

    if (purchaseOrder.status === "CANCELLED") {
      notFound();
    }

    return (
      <PurchaseReceipt
        allTaxes={allTaxes}
        orgSlug={orgSlug}
        purchaseOrder={purchaseOrder}
      />
    );
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    notFound();
  }
}
