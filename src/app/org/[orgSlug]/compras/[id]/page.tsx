import { notFound } from "next/navigation";
import { PurchaseDetail } from "@/components/purchases/detail/purchase-detail";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import { getOrderIdByPurchaseOrderId } from "@/modules/orders/service/orders.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
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

    const [suppliers, taxes, products, categories, relatedOrder] =
      await Promise.all([
        getSuppliersByOrgSlug(orgSlug),
        getActiveTaxesByOrgSlug(orgSlug),
        getAllProductsByOrg(orgSlug),
        getCategoriesByOrgSlug(orgSlug),
        getOrderIdByPurchaseOrderId(orgSlug, id),
      ]);

    return (
      <PurchaseDetail
        categories={categories}
        orgSlug={orgSlug}
        products={products}
        purchaseOrder={purchaseOrder}
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
