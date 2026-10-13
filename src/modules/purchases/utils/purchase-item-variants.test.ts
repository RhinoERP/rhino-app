import { describe, expect, it } from "vitest";
import {
  purchaseVariantAllocationChanged,
  quantityAfterVariantChange,
  validatePurchaseVariantAllocation,
} from "./purchase-item-variants";

const variants = [
  { color: "Negro", talle: "42" },
  { color: "Negro", talle: "44" },
];

describe("variantes de ítems de compra", () => {
  it("conserva las unidades existentes sin talle hasta completar la matriz", () => {
    const oldStocks = { Negro: { "42": 1 } };
    expect(
      quantityAfterVariantChange(2, oldStocks, { Negro: { "42": 1, "44": 0 } })
    ).toBe(2);
    expect(
      quantityAfterVariantChange(2, oldStocks, { Negro: { "42": 2 } })
    ).toBe(2);
    expect(
      quantityAfterVariantChange(
        2,
        { Negro: { "42": 2 } },
        { Negro: { "42": 2, "44": 2 } }
      )
    ).toBe(4);
    expect(
      quantityAfterVariantChange(
        4,
        { Negro: { "42": 2, "44": 2 } },
        { Negro: { "42": 1, "44": 2 } }
      )
    ).toBe(3);
  });

  it("permite distribuir una nueva compra entre los talles disponibles", () => {
    expect(quantityAfterVariantChange(2, {}, { Negro: { "42": 1 } })).toBe(2);
    expect(
      quantityAfterVariantChange(
        2,
        { Negro: { "42": 1 } },
        { Negro: { "42": 1, "44": 1 } }
      )
    ).toBe(2);
    expect(
      validatePurchaseVariantAllocation(
        2,
        { Negro: { "42": 1, "44": 1 } },
        variants
      )
    ).toBeNull();
  });

  it("rechaza distribuciones incompletas y combinaciones ajenas al producto", () => {
    expect(validatePurchaseVariantAllocation(2, null, variants)).toContain(
      "Asigná"
    );
    expect(
      validatePurchaseVariantAllocation(2, { Negro: { "42": 1 } }, variants)
    ).toContain("1 de 2 unidades");
    expect(
      validatePurchaseVariantAllocation(2, { Azul: { "42": 2 } }, variants)
    ).toContain("no está activa");
    expect(
      validatePurchaseVariantAllocation(2, { Negro: { "42": -1 } }, variants)
    ).toContain("enteros no negativos");
  });

  it("distingue líneas existentes intactas de asignaciones nuevas o modificadas", () => {
    const saved = {
      id: "item-1",
      product_id: "product-1",
      quantity: 2,
      variant_stocks: { Negro: { "42": 1 } },
    };
    expect(purchaseVariantAllocationChanged({ ...saved }, saved)).toBe(false);
    expect(
      purchaseVariantAllocationChanged(
        { ...saved, variant_stocks: { Negro: { "42": 2 } } },
        saved
      )
    ).toBe(true);
    expect(purchaseVariantAllocationChanged(saved)).toBe(true);
  });
});
