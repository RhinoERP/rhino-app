import { truncateMoney } from "@/lib/decimal";

type LegacyItem = {
  id?: string;
  product_id: string;
  quantity: number;
  unit_quantity: number | null;
  unit_cost: number | null;
  subtotal: number | null;
  variant_stocks?: unknown;
};

export function legacyPurchaseFiscalFieldsChanged(params: {
  savedItems: LegacyItem[];
  inputItems?: LegacyItem[];
  savedDiscountPercent: number;
  inputDiscountPercent?: number;
  selectedTaxCount: number;
}): boolean {
  if (
    params.selectedTaxCount > 0 ||
    (params.inputDiscountPercent !== undefined &&
      params.inputDiscountPercent !== params.savedDiscountPercent)
  ) {
    return true;
  }
  if (!params.inputItems) {
    return false;
  }
  const byId = new Map(params.savedItems.map((item) => [item.id, item]));
  return (
    params.inputItems.length !== byId.size ||
    params.inputItems.some((item) => {
      const saved = byId.get(item.id);
      return (
        !saved ||
        saved.product_id !== item.product_id ||
        saved.quantity !== item.quantity ||
        (saved.unit_quantity !== null &&
          saved.unit_quantity !== item.unit_quantity) ||
        truncateMoney(saved.unit_cost ?? 0) !==
          truncateMoney(item.unit_cost ?? 0) ||
        truncateMoney(saved.subtotal ?? 0) !==
          truncateMoney(item.subtotal ?? 0) ||
        JSON.stringify(saved.variant_stocks ?? null) !==
          JSON.stringify(item.variant_stocks ?? null)
      );
    })
  );
}
