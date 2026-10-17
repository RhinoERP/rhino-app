import { notFound } from "next/navigation";
import { PurchaseDetail } from "@/components/purchases/detail/purchase-detail";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import { getOrderIdByPurchaseOrderId } from "@/modules/orders/service/orders.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import {
  getPurchaseReceiptHistory,
  getPurchaseReceiptMismatch,
  getPurchaseReceiptProgress,
  hasRegisteredPurchaseInvoice,
} from "@/modules/purchases/service/purchase-receipts.service";
import {
  getAllProductsByOrg,
  getPurchaseOrderWithItems,
} from "@/modules/purchases/service/purchases.service";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type PurchaseOrderPageProps = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

export default async function PurchaseOrderPage({
  params,
}: PurchaseOrderPageProps) {
  const { orgSlug, id } = await params;
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.purchases);

  try {
    const purchaseOrder = await getPurchaseOrderWithItems(orgSlug, id);

    const [
      suppliers,
      products,
      categories,
      relatedOrder,
      taxes,
      progress,
      receiptHistory,
      hasSupplierInvoice,
      receiptMismatch,
    ] = await Promise.all([
      getSuppliersByOrgSlug(orgSlug),
      getAllProductsByOrg(orgSlug),
      getCategoriesByOrgSlug(orgSlug),
      getOrderIdByPurchaseOrderId(orgSlug, id),
      getActiveTaxesByOrgSlug(orgSlug),
      getPurchaseReceiptProgress(orgSlug, id),
      getPurchaseReceiptHistory(orgSlug, id),
      hasRegisteredPurchaseInvoice(orgSlug, id),
      getPurchaseReceiptMismatch(orgSlug, id),
    ]);

    return (
      <PurchaseDetail
        categories={categories}
        invoiceMismatch={hasSupplierInvoice && receiptMismatch}
        orgSlug={orgSlug}
        products={products}
        purchaseOrder={purchaseOrder}
        receiptHistory={receiptHistory}
        receivedProgress={Object.fromEntries(progress)}
        relatedOrder={relatedOrder}
        suppliers={suppliers}
        taxes={taxes}
      />
    );
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    notFound();
  }
}
