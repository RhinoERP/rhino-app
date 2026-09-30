import { describe, expect, it } from "vitest";
import { legacyPurchaseFiscalFieldsChanged } from "./purchase-legacy";

const saved = {
  id: "line-1",
  product_id: "product-1",
  quantity: 2,
  unit_quantity: null,
  unit_cost: 100,
  subtotal: 200,
  variant_stocks: null,
};

describe("edición de compras anteriores al desglose", () => {
  it("permite cambiar metadatos conservando el agregado original", () => {
    expect(
      legacyPurchaseFiscalFieldsChanged({
        savedItems: [saved],
        inputItems: [{ ...saved, unit_quantity: 2 }],
        savedDiscountPercent: 0,
        inputDiscountPercent: 0,
        selectedTaxCount: 0,
      })
    ).toBe(false);
  });

  it("requiere conversión explícita para cambiar ítems o descuentos", () => {
    const params = {
      savedItems: [saved],
      savedDiscountPercent: 0,
      selectedTaxCount: 0,
    };
    expect(
      legacyPurchaseFiscalFieldsChanged({
        ...params,
        inputItems: [{ ...saved, subtotal: 250 }],
      })
    ).toBe(true);
    expect(
      legacyPurchaseFiscalFieldsChanged({
        ...params,
        inputItems: [saved],
        inputDiscountPercent: 5,
      })
    ).toBe(true);
    expect(
      legacyPurchaseFiscalFieldsChanged({
        ...params,
        inputItems: [saved],
        selectedTaxCount: 1,
      })
    ).toBe(true);
  });
});
