import type { PriceListAssignment } from "@/modules/sales/utils/pre-sale-pricing";
import { buildProductPriceMap } from "@/modules/sales/utils/pre-sale-pricing";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";

export function buildOfflineProductPriceMap(
  snapshot: SellerOfflineSnapshotV1,
  customerId: string | null
) {
  const customer = snapshot.customers.find((entry) => entry.id === customerId);
  const salesPriceLists = new Map(
    snapshot.salesPriceLists.map((list) => [list.id, list])
  );
  const fallbackList = customer?.salesPriceListId
    ? salesPriceLists.get(customer.salesPriceListId)
    : null;
  const fallback: PriceListAssignment | null = fallbackList
    ? { type: fallbackList.type, value: fallbackList.value }
    : null;
  const assignments = snapshot.customerPriceAssignments.filter(
    (assignment) => assignment.customerId === customerId
  );
  const supplierPriceMap = new Map<string, PriceListAssignment>();
  const supplierPriceListItems = new Map<
    string,
    Map<string, { productId: string; costPrice: number; margin: number | null }>
  >();

  for (const assignment of assignments) {
    if (assignment.salesPriceListId) {
      const salesList = salesPriceLists.get(assignment.salesPriceListId);
      if (salesList) {
        supplierPriceMap.set(assignment.supplierId, {
          type: salesList.type,
          value: salesList.value,
        });
      }
    }
    if (assignment.purchasePriceListId) {
      const items = snapshot.purchasePriceListItems.filter(
        (item) => item.priceListId === assignment.purchasePriceListId
      );
      supplierPriceListItems.set(
        assignment.supplierId,
        new Map(items.map((item) => [item.productId, item]))
      );
    }
  }

  return buildProductPriceMap(
    snapshot.products.map((product) => ({ ...product, hasVariants: false })),
    supplierPriceMap,
    supplierPriceListItems,
    fallback
  );
}
