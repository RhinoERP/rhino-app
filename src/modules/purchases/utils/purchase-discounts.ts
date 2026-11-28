import { truncateMoney } from "@/lib/decimal";
import { getBaseUnitPrice } from "@/modules/inventory/utils/case-units";
import type { Database } from "@/types/supabase";

export type PurchaseDiscountMethod =
  Database["public"]["Enums"]["purchase_discount_method"];

export const HABITUAL_DISCOUNT_FIELDS = [
  "discount_1_percentage",
  "discount_2_percentage",
  "discount_3_percentage",
  "discount_4_percentage",
  "discount_5_percentage",
] as const;

export const POST_INVOICE_DISCOUNTS = [
  {
    field: "post_invoice_prompt_payment_discount_percentage",
    label: "Pronto pago",
  },
  { field: "post_invoice_volume_discount_percentage", label: "Volumen" },
  { field: "post_invoice_goods_discount_percentage", label: "Mercadería" },
] as const;

export type HabitualDiscounts = Partial<
  Record<(typeof HABITUAL_DISCOUNT_FIELDS)[number], number | null>
>;
export type PurchaseDiscountDetails = HabitualDiscounts &
  Partial<
    Record<(typeof POST_INVOICE_DISCOUNTS)[number]["field"], number | null>
  > & {
    list_unit_cost?: number | null;
    habitual_discount_method?: PurchaseDiscountMethod;
    post_invoice_discounts_include_taxes?: boolean;
  };

export const PURCHASE_DISCOUNT_METHOD_LABELS: Record<
  PurchaseDiscountMethod,
  string
> = {
  additive: "Sumatorio",
  sequential: "Escalonado",
};

export function validateHabitualDiscounts(
  discounts: HabitualDiscounts,
  method: PurchaseDiscountMethod
): void {
  if (!(method === "additive" || method === "sequential")) {
    throw new Error("El método de descuentos no es válido");
  }
  let total = 0;
  for (const field of HABITUAL_DISCOUNT_FIELDS) {
    const value = discounts[field] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("Cada descuento habitual debe estar entre 0 y 100%");
    }
    total += value;
  }
  if (method === "additive" && total >= 100) {
    throw new Error(
      "La suma de los descuentos habituales debe ser menor al 100%"
    );
  }
}

/** No intermediate cent truncation; matches calculate_habitual_purchase_cost. */
export function calculateHabitualPurchaseCost(
  listPrice: number,
  method: PurchaseDiscountMethod,
  discounts: HabitualDiscounts
): number {
  validateHabitualDiscounts(discounts, method);
  if (!Number.isFinite(listPrice) || listPrice < 0) {
    throw new Error("El precio de lista debe ser un importe válido");
  }
  if (method === "additive") {
    return (
      listPrice *
      (1 -
        HABITUAL_DISCOUNT_FIELDS.reduce(
          (sum, field) => sum + (discounts[field] ?? 0),
          0
        ) /
          100)
    );
  }
  return HABITUAL_DISCOUNT_FIELDS.reduce(
    (price, field) => price * (1 - (discounts[field] ?? 0) / 100),
    listPrice
  );
}

export function validatePurchaseDiscountDetails(
  details: PurchaseDiscountDetails
): void {
  validateHabitualDiscounts(
    details,
    details.habitual_discount_method ?? "sequential"
  );
  if (
    details.list_unit_cost != null &&
    (!Number.isFinite(details.list_unit_cost) || details.list_unit_cost < 0)
  ) {
    throw new Error("El precio de lista debe ser un importe válido");
  }
  if (
    details.list_unit_cost == null &&
    HABITUAL_DISCOUNT_FIELDS.some((field) => (details[field] ?? 0) !== 0)
  ) {
    throw new Error(
      "Debe indicar el precio de lista de los descuentos habituales"
    );
  }
  for (const { field } of POST_INVOICE_DISCOUNTS) {
    const value = details[field] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("Cada descuento post factura debe estar entre 0 y 100%");
    }
  }
}

/** Explicit serialization avoids leaking other line/form properties into RPCs. */
export function getPurchaseDiscountDetails(
  item: PurchaseDiscountDetails = {},
  preserveDefaults = false
): PurchaseDiscountDetails {
  if (
    item.list_unit_cost == null &&
    !HABITUAL_DISCOUNT_FIELDS.some((field) => (item[field] ?? 0) !== 0) &&
    !POST_INVOICE_DISCOUNTS.some(({ field }) => (item[field] ?? 0) !== 0) &&
    item.post_invoice_discounts_include_taxes !== true &&
    !preserveDefaults
  ) {
    return {};
  }
  return {
    list_unit_cost: item.list_unit_cost ?? null,
    habitual_discount_method: item.habitual_discount_method ?? "sequential",
    ...Object.fromEntries(
      HABITUAL_DISCOUNT_FIELDS.map((field) => [field, item[field] ?? 0])
    ),
    ...Object.fromEntries(
      POST_INVOICE_DISCOUNTS.map(({ field }) => [field, item[field] ?? 0])
    ),
    post_invoice_discounts_include_taxes:
      item.post_invoice_discounts_include_taxes ?? false,
  };
}

/** A saved line can explicitly clear its last discount. Keep its zero values
 * in write payloads: omission means preserve the previous database snapshot. */
export function serializePurchaseDiscountDetails(
  item: PurchaseDiscountDetails
): PurchaseDiscountDetails {
  return getPurchaseDiscountDetails(item, item.list_unit_cost !== undefined);
}

export function purchaseDiscountDetailsChanged(
  current: PurchaseDiscountDetails,
  saved: PurchaseDiscountDetails
): boolean {
  return (
    JSON.stringify(getPurchaseDiscountDetails(current)) !==
    JSON.stringify(getPurchaseDiscountDetails(saved))
  );
}

/** Operational cost only: never fed into purchase totals, taxes or payables. */
export function calculatePostInvoiceCost(
  habitualNetAmount: number,
  taxAmount: number,
  details: PurchaseDiscountDetails
) {
  validatePurchaseDiscountDetails(details);
  const base =
    habitualNetAmount +
    (details.post_invoice_discounts_include_taxes ? taxAmount : 0);
  const cost = POST_INVOICE_DISCOUNTS.reduce(
    (amount, { field }) => amount * (1 - (details[field] ?? 0) / 100),
    base
  );
  return {
    base: truncateMoney(base),
    cost: truncateMoney(cost),
    discountAmount: truncateMoney(base - cost),
  };
}

export function calculateHabitualUnitCost(
  listUnitCost: number,
  details: PurchaseDiscountDetails,
  unitOfMeasure?: string | null,
  unitsPerBox?: number | null
): number {
  const factor = unitOfMeasure === "CAJA" ? (unitsPerBox ?? 0) : 1;
  return getBaseUnitPrice(
    truncateMoney(
      calculateHabitualPurchaseCost(
        listUnitCost * factor,
        details.habitual_discount_method ?? "sequential",
        details
      )
    ),
    unitOfMeasure,
    unitsPerBox
  );
}

export function updatePurchaseListCost<
  T extends PurchaseDiscountDetails & {
    quantity: number;
    unit_quantity?: number;
    unit_of_measure?: string;
    units_per_box?: number | null;
    discount_percent?: number;
    unit_cost: number;
    subtotal: number;
  },
>(item: T, listUnitCost: number): T {
  const unitCost = calculateHabitualUnitCost(
    listUnitCost,
    item,
    item.unit_of_measure,
    item.units_per_box
  );
  const measured = ["KG", "LT", "MT"].includes(item.unit_of_measure ?? "");
  return {
    ...item,
    list_unit_cost: listUnitCost,
    unit_cost: unitCost,
    price_per_kg: item.unit_of_measure === "KG" ? unitCost : undefined,
    subtotal: truncateMoney(
      (measured ? (item.unit_quantity ?? item.quantity) : item.quantity) *
        unitCost *
        (1 - (item.discount_percent ?? 0) / 100)
    ),
  };
}

export function recalculateHabitualPurchaseLine<
  T extends Parameters<typeof updatePurchaseListCost>[0],
>(item: T): T {
  return item.list_unit_cost != null
    ? updatePurchaseListCost(item, item.list_unit_cost)
    : item;
}
