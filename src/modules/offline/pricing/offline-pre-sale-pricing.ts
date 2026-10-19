import type { PriceListAssignment } from "@/modules/sales/utils/pre-sale-pricing";
import { buildProductPriceMap } from "@/modules/sales/utils/pre-sale-pricing";
import type { OfflinePreSaleDraft } from "../contracts/offline-pre-sale-draft";
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

export type OfflineDraftMigrationIssue = {
  kind: "customer" | "seller" | "product" | "payment-method";
  referenceId: string;
  lineId?: string;
};

export type OfflineDraftCommercialChange = {
  kind: "price" | "taxes";
  lineId: string;
  productId: string;
  previousValue:
    | number
    | OfflinePreSaleDraft["payload"]["items"][number]["taxes"];
  currentValue:
    | number
    | OfflinePreSaleDraft["payload"]["items"][number]["taxes"];
};

export type OfflineDraftMigration = {
  proposedDraft: OfflinePreSaleDraft;
  issues: OfflineDraftMigrationIssue[];
  commercialChanges: OfflineDraftCommercialChange[];
  needsMigration: boolean;
};

const taxesMatch = (
  left: OfflinePreSaleDraft["payload"]["items"][number]["taxes"],
  right: OfflinePreSaleDraft["payload"]["items"][number]["taxes"]
) => JSON.stringify(left) === JSON.stringify(right);

export function revalidateOfflinePreSaleDraft(
  draft: OfflinePreSaleDraft,
  snapshot: SellerOfflineSnapshotV1
): OfflineDraftMigration {
  if (
    draft.ownerUserId !== snapshot.ownerUserId ||
    draft.organizationId !== snapshot.organizationId
  ) {
    throw new Error("El borrador no pertenece a la particion activa");
  }

  const needsMigration = draft.snapshotId !== snapshot.snapshotId;
  if (!needsMigration) {
    return {
      proposedDraft: draft,
      issues: [],
      commercialChanges: [],
      needsMigration,
    };
  }

  const issues: OfflineDraftMigrationIssue[] = [];
  if (
    draft.payload.customerId &&
    !snapshot.customers.some(({ id }) => id === draft.payload.customerId)
  ) {
    issues.push({ kind: "customer", referenceId: draft.payload.customerId });
  }
  if (!snapshot.sellers.some(({ id }) => id === draft.payload.sellerId)) {
    issues.push({ kind: "seller", referenceId: draft.payload.sellerId });
  }
  if (
    !snapshot.settings.enabledPaymentMethods.includes(
      draft.payload.paymentMethod
    )
  ) {
    issues.push({
      kind: "payment-method",
      referenceId: draft.payload.paymentMethod,
    });
  }

  const products = new Map(
    snapshot.products.map((product) => [product.id, product])
  );
  const prices = buildOfflineProductPriceMap(
    snapshot,
    draft.payload.customerId
  );
  const fallbackTaxes = snapshot.settings.defaultTaxIds.flatMap((taxId) => {
    const tax = snapshot.taxes.find(({ id }) => id === taxId);
    return tax
      ? [{ taxId: tax.id, name: tax.name, rate: tax.rate, code: tax.code }]
      : [];
  });
  const commercialChanges: OfflineDraftCommercialChange[] = [];
  const items = draft.payload.items.map((item) => {
    const product = products.get(item.productId);
    if (!product) {
      issues.push({
        kind: "product",
        referenceId: item.productId,
        lineId: item.lineId,
      });
      return item;
    }
    const unitPrice = prices.get(item.productId) ?? product.price;
    const taxes = product.taxes.length > 0 ? product.taxes : fallbackTaxes;
    if (unitPrice !== item.unitPrice) {
      commercialChanges.push({
        kind: "price",
        lineId: item.lineId,
        productId: item.productId,
        previousValue: item.unitPrice,
        currentValue: unitPrice,
      });
    }
    if (!taxesMatch(item.taxes, taxes)) {
      commercialChanges.push({
        kind: "taxes",
        lineId: item.lineId,
        productId: item.productId,
        previousValue: item.taxes,
        currentValue: taxes,
      });
    }
    return { ...item, unitPrice, taxes };
  });

  return {
    needsMigration,
    issues,
    commercialChanges,
    proposedDraft: {
      ...draft,
      snapshotId: snapshot.snapshotId,
      orgSlug: snapshot.organization.slug,
      purgeAfterHours: snapshot.settings.purgeAfterHours,
      payload: { ...draft.payload, items },
    },
  };
}
