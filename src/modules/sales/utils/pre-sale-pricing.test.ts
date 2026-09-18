import { describe, expect, it } from "vitest";
import type { SaleProduct } from "../types";
import {
  applyPriceListAssignment,
  buildProductPriceMap,
} from "./pre-sale-pricing";

const product = {
  id: "product-1",
  name: "Producto",
  sku: "SKU-1",
  price: 100,
  currency: "ARS",
  supplierId: "supplier-1",
  unitOfMeasure: "UN",
  tracksStockUnits: false,
  totalQuantity: 10,
  totalUnitQuantity: 10,
  averageQuantityPerUnit: 1,
  hasVariants: false,
} satisfies SaleProduct;

describe("pre-sale pricing", () => {
  it("conserva el precio base cuando no hay asignaciones", () => {
    const prices = buildProductPriceMap([product], new Map(), new Map(), null);

    expect(prices.get(product.id)).toBe(100);
  });

  it("aplica la lista general del cliente", () => {
    expect(
      applyPriceListAssignment(100, { type: "PERCENTAGE", value: 15 })
    ).toBe(115);
    expect(applyPriceListAssignment(100, { type: "PRICE", value: 25 })).toBe(
      125
    );
  });

  it("prioriza costo y margen de proveedor y luego su lista de venta", () => {
    const prices = buildProductPriceMap(
      [product],
      new Map([["supplier-1", { type: "PERCENTAGE" as const, value: 10 }]]),
      new Map([
        [
          "supplier-1",
          new Map([
            [
              "product-1",
              { productId: "product-1", costPrice: 80, margin: 25 },
            ],
          ]),
        ],
      ]),
      { type: "PERCENTAGE", value: 50 }
    );

    expect(prices.get(product.id)).toBe(110);
  });

  it("usa el precio base del proveedor sin margen cuando corresponde", () => {
    const prices = buildProductPriceMap(
      [product],
      new Map(),
      new Map([
        [
          "supplier-1",
          new Map([
            [
              "product-1",
              { productId: "product-1", costPrice: 80, margin: null },
            ],
          ]),
        ],
      ]),
      null
    );

    expect(prices.get(product.id)).toBe(80);
  });
});
