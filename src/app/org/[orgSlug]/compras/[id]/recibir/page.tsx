import { notFound } from "next/navigation";
import { PurchaseReceipt } from "@/components/purchases/shared/purchase-receipt";
import {
  getPurchaseReceiptProgress,
  hasRegisteredPurchaseInvoice,
} from "@/modules/purchases/service/purchase-receipts.service";
import {
  getAllProductsByOrg,
  getPurchaseOrderWithItems,
} from "@/modules/purchases/service/purchases.service";
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
    const [purchaseOrder, allTaxes, progress, products, hasSupplierInvoice] =
      await Promise.all([
        getPurchaseOrderWithItems(orgSlug, id),
        getAllTaxesByOrgSlug(orgSlug),
        getPurchaseReceiptProgress(orgSlug, id),
        getAllProductsByOrg(orgSlug),
        hasRegisteredPurchaseInvoice(orgSlug, id),
      ]);

    if (!["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
      notFound();
    }

    return (
      <PurchaseReceipt
        allTaxes={allTaxes}
        hasSupplierInvoice={hasSupplierInvoice}
        orgSlug={orgSlug}
        products={products}
        purchaseOrder={purchaseOrder}
        receivedProgress={Object.fromEntries(progress)}
      />
    );
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    notFound();
  }
}
