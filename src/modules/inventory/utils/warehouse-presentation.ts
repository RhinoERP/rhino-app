export type WarehouseOption = {
  id: string;
  name: string;
  is_default?: boolean;
};

export function getWarehouseFieldPresentation(
  warehouses: WarehouseOption[],
  selectedId: string | undefined,
  readOnly = false
): "hidden" | "text" | "select" | "empty" {
  if (readOnly) {
    return "text";
  }
  if (warehouses.length === 0) {
    return "empty";
  }
  const selected = warehouses.find((warehouse) => warehouse.id === selectedId);
  if (!selected || warehouses.length > 1) {
    return "select";
  }
  return selected.is_default ? "hidden" : "text";
}

export function shouldShowStockWarehouseFilter(
  warehouses: { is_active: boolean }[],
  selectedId?: string | null
) {
  return (
    Boolean(selectedId) ||
    warehouses.length > 1 ||
    warehouses.some((warehouse) => !warehouse.is_active)
  );
}
