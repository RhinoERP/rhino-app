import { truncateMoney } from "@/lib/decimal";

export type VariantQuantities = Record<string, Record<string, number>>;

export function hasPendingPurchaseReceipt(params: {
  newItem?: boolean;
  quantity: number;
  unitQuantity: number;
}): boolean {
  return (
    params.newItem === true || params.quantity > 0 || params.unitQuantity > 0
  );
}

export type ReceivedProgress = {
  quantity: number;
  unitQuantity: number;
  variantStocks: VariantQuantities;
  unitCost: number;
  subtotal: number;
};

type ReceiptProgressRow = {
  purchase_order_item_id: string;
  quantity: number;
  unit_quantity: number;
  unit_cost: number;
  variant_stocks: VariantQuantities;
};

export function mergeVariantStocks(
  first: VariantQuantities,
  second: VariantQuantities
): VariantQuantities {
  const merged = structuredClone(first);
  for (const [color, sizes] of Object.entries(second)) {
    merged[color] ??= {};
    for (const [size, quantity] of Object.entries(sizes)) {
      merged[color][size] = (merged[color][size] ?? 0) + quantity;
    }
  }
  return merged;
}

export function appendReceiptProgress(
  progress: Map<string, ReceivedProgress>,
  row: ReceiptProgressRow
): void {
  const previous = progress.get(row.purchase_order_item_id);
  const quantity = (previous?.quantity ?? 0) + row.quantity;
  const unitQuantity = (previous?.unitQuantity ?? 0) + row.unit_quantity;
  const subtotal = truncateMoney(
    (previous?.subtotal ?? 0) +
      truncateMoney(
        (row.unit_quantity > 0 ? row.unit_quantity : row.quantity) *
          row.unit_cost
      )
  );
  progress.set(row.purchase_order_item_id, {
    quantity,
    unitQuantity,
    variantStocks: mergeVariantStocks(
      previous?.variantStocks ?? {},
      row.variant_stocks ?? {}
    ),
    unitCost: subtotal / (unitQuantity > 0 ? unitQuantity : quantity),
    subtotal,
  });
}

export function calculateReceiptProgress(
  rows: ReceiptProgressRow[]
): Map<string, ReceivedProgress> {
  const progress = new Map<string, ReceivedProgress>();
  for (const row of rows) {
    appendReceiptProgress(progress, row);
  }
  return progress;
}

export function remainingVariantStocks(
  ordered: VariantQuantities | null,
  received: VariantQuantities | undefined
): VariantQuantities {
  return Object.fromEntries(
    Object.entries(ordered ?? {}).map(([color, sizes]) => [
      color,
      Object.fromEntries(
        Object.entries(sizes).map(([size, quantity]) => [
          size,
          Math.max(0, quantity - (received?.[color]?.[size] ?? 0)),
        ])
      ),
    ])
  );
}

export function groupReceiptItems<T extends { receipt_id: string }>(
  lines: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const line of lines) {
    const group = grouped.get(line.receipt_id);
    if (group) {
      group.push(line);
    } else {
      grouped.set(line.receipt_id, [line]);
    }
  }
  return grouped;
}

/** Units still to receive; variant products use their pending variant units. */
export function pendingReceiptUnitQuantity(params: {
  hasVariants: boolean;
  unitQuantity: number | null | undefined;
  receivedUnitQuantity: number;
  pendingVariantUnits: number;
}): number {
  if (params.hasVariants) {
    return params.pendingVariantUnits;
  }
  return Math.max(0, (params.unitQuantity ?? 0) - params.receivedUnitQuantity);
}

export function hasUnreceivedVariantQuantities(
  ordered: VariantQuantities | null,
  selected: VariantQuantities
): boolean {
  return Object.entries(ordered ?? {}).some(([color, sizes]) =>
    Object.entries(sizes).some(
      ([size, quantity]) => (selected[color]?.[size] ?? 0) < quantity
    )
  );
}

/** Unselected lines with nothing left to deliver do not reopen a purchase. */
export function hasUnreceivedPurchaseQuantities(
  items: Array<{
    received: boolean;
    orderedQuantity?: number;
    orderedUnitQuantity?: number;
  }>,
  selected: Array<{
    orderedQty: number;
    modifiedQty: number;
    orderedUnitQty: number;
    modifiedUnitQty: number;
  }>
): boolean {
  return (
    items.some(
      (item) =>
        !item.received &&
        ((item.orderedQuantity ?? 0) > 0 || (item.orderedUnitQuantity ?? 0) > 0)
    ) ||
    selected.some(
      (item) =>
        item.modifiedQty < item.orderedQty ||
        item.modifiedUnitQty < item.orderedUnitQty
    )
  );
}
