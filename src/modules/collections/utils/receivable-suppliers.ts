import type { CollectionExportItem, ReceivableAccount } from "../types";

export function suppliersFromSaleItems(
  items: CollectionExportItem[] | undefined
): NonNullable<ReceivableAccount["suppliers"]> {
  const suppliers = new Map<string, string>();
  for (const item of items ?? []) {
    if (item.supplierId) {
      suppliers.set(item.supplierId, item.supplierName || "Proveedor");
    }
  }
  return Array.from(suppliers, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

export function receivableSupplierLabel(
  suppliers: ReceivableAccount["suppliers"]
): string {
  if (!suppliers?.length) {
    return "—";
  }
  return suppliers.length === 1 ? suppliers[0].name : "Varios";
}
