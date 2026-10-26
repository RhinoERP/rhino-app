import { describe, expect, it } from "vitest";
import {
  appendReceiptProgress,
  calculateReceiptProgress,
  groupReceiptItems,
  hasUnreceivedPurchaseQuantities,
  hasUnreceivedVariantQuantities,
  pendingReceiptUnitQuantity,
  remainingVariantStocks,
} from "./receipt-progress";

describe("entregas acumuladas de una OC", () => {
  it("previsualiza una entrega adicional sin alterar las entregas ya registradas", () => {
    const progress = calculateReceiptProgress([
      {
        purchase_order_item_id: "remeras",
        quantity: 8,
        unit_quantity: 0,
        unit_cost: 10,
        variant_stocks: { Negro: { XL: 8 } },
      },
    ]);
    appendReceiptProgress(progress, {
      purchase_order_item_id: "remeras",
      quantity: 4,
      unit_quantity: 0,
      unit_cost: 20,
      variant_stocks: { Negro: { XL: 2, XXL: 2 } },
    });
    expect(progress.get("remeras")).toMatchObject({
      quantity: 12,
      subtotal: 160,
      variantStocks: { Negro: { XL: 10, XXL: 2 } },
    });
  });
  it("mantiene el pendiente de ítems no seleccionados y acumula entregas sucesivas", () => {
    const first = calculateReceiptProgress([
      {
        purchase_order_item_id: "remeras",
        quantity: 8,
        unit_quantity: 8,
        unit_cost: 10,
        variant_stocks: {},
      },
    ]);
    expect(10 - (first.get("remeras")?.quantity ?? 0)).toBe(2);
    expect(5 - (first.get("buzos")?.quantity ?? 0)).toBe(5);

    const both = calculateReceiptProgress([
      {
        purchase_order_item_id: "remeras",
        quantity: 8,
        unit_quantity: 8,
        unit_cost: 10,
        variant_stocks: {},
      },
      {
        purchase_order_item_id: "remeras",
        quantity: 2,
        unit_quantity: 2,
        unit_cost: 20,
        variant_stocks: {},
      },
    ]);
    expect(both.get("remeras")?.quantity).toBe(10);
    expect(both.get("remeras")?.subtotal).toBe(120);
    expect(both.get("remeras")?.unitCost).toBe(12);
  });

  it("ofrece solo los talles todavía pendientes de recibir", () => {
    const progress = calculateReceiptProgress([
      {
        purchase_order_item_id: "remeras",
        quantity: 3,
        unit_quantity: 0,
        unit_cost: 10,
        variant_stocks: { Negro: { "42": 3 } },
      },
      {
        purchase_order_item_id: "remeras",
        quantity: 2,
        unit_quantity: 0,
        unit_cost: 10,
        variant_stocks: { Negro: { "42": 2 } },
      },
    ]);
    expect(
      remainingVariantStocks(
        { Negro: { "42": 7, "44": 5 } },
        progress.get("remeras")?.variantStocks
      )
    ).toEqual({ Negro: { "42": 2, "44": 5 } });
  });

  it("acumula la medida recibida aunque la línea no registre unidades enteras", () => {
    const progress = calculateReceiptProgress([
      {
        purchase_order_item_id: "peso",
        quantity: 0,
        unit_quantity: 8,
        unit_cost: 5,
        variant_stocks: {},
      },
    ]);
    expect(progress.get("peso")?.quantity).toBe(0);
    expect(progress.get("peso")?.unitQuantity).toBe(8);
    expect(progress.get("peso")?.subtotal).toBe(40);
  });

  it("detecta una entrega incompleta cuando un producto entero no fue marcado", () => {
    expect(
      hasUnreceivedPurchaseQuantities(
        [{ received: true }, { received: false, orderedQuantity: 5 }],
        [
          {
            orderedQty: 10,
            modifiedQty: 10,
            orderedUnitQty: 10,
            modifiedUnitQty: 10,
          },
        ]
      )
    ).toBe(true);
    expect(
      hasUnreceivedPurchaseQuantities(
        [{ received: true }],
        [
          {
            orderedQty: 10,
            modifiedQty: 8,
            orderedUnitQty: 10,
            modifiedUnitQty: 8,
          },
        ]
      )
    ).toBe(true);
    expect(
      hasUnreceivedPurchaseQuantities(
        [{ received: true }],
        [
          {
            orderedQty: 10,
            modifiedQty: 10,
            orderedUnitQty: 10,
            modifiedUnitQty: 10,
          },
        ]
      )
    ).toBe(false);
  });

  it("permite excedente y deja pendiente solo lo que realmente falta", () => {
    expect(
      hasUnreceivedPurchaseQuantities(
        [
          { received: true, orderedQuantity: 6 },
          { received: true, orderedQuantity: 2 },
        ],
        [
          {
            orderedQty: 6,
            modifiedQty: 8,
            orderedUnitQty: 0,
            modifiedUnitQty: 0,
          },
          {
            orderedQty: 2,
            modifiedQty: 1,
            orderedUnitQty: 0,
            modifiedUnitQty: 0,
          },
        ]
      )
    ).toBe(true);
    expect(
      hasUnreceivedPurchaseQuantities(
        [
          { received: false, orderedQuantity: 0 },
          { received: true, orderedQuantity: 0 },
        ],
        [
          {
            orderedQty: 0,
            modifiedQty: 2,
            orderedUnitQty: 0,
            modifiedUnitQty: 0,
          },
        ]
      )
    ).toBe(false);
  });

  it("detecta el talle faltante aunque haya llegado otro y el total coincida", () => {
    expect(
      hasUnreceivedVariantQuantities(
        { Negro: { XL: 10 } },
        { Negro: { XL: 8, XXL: 2 } }
      )
    ).toBe(true);
    expect(
      hasUnreceivedVariantQuantities(
        { Negro: { XL: 10 } },
        { Negro: { XL: 12 } }
      )
    ).toBe(false);
  });
});

describe("pendiente de unidades en la recepción", () => {
  it("usa las unidades pendientes de variantes y no el total histórico de la OC", () => {
    const pendingUnitQuantity = pendingReceiptUnitQuantity({
      hasVariants: true,
      unitQuantity: 10,
      receivedUnitQuantity: 0,
      pendingVariantUnits: 4,
    });
    expect(pendingUnitQuantity).toBe(4);
    expect(
      hasUnreceivedPurchaseQuantities(
        [{ received: true, orderedQuantity: 4 }],
        [
          {
            orderedQty: 4,
            modifiedQty: 6,
            orderedUnitQty: pendingUnitQuantity,
            modifiedUnitQty: 6,
          },
        ]
      )
    ).toBe(false);
  });

  it("descuenta la medida recibida en productos por peso", () => {
    expect(
      pendingReceiptUnitQuantity({
        hasVariants: false,
        unitQuantity: 8,
        receivedUnitQuantity: 3.25,
        pendingVariantUnits: 0,
      })
    ).toBeCloseTo(4.75);
  });

  it("no deja pendientes negativos sin variantes", () => {
    expect(
      pendingReceiptUnitQuantity({
        hasVariants: false,
        unitQuantity: 2,
        receivedUnitQuantity: 5,
        pendingVariantUnits: 0,
      })
    ).toBe(0);
  });
});

describe("agrupación de líneas por entrega", () => {
  it("agrupa por recepción y mantiene el orden de las líneas", () => {
    const grouped = groupReceiptItems([
      { receipt_id: "primera", product_id: "remera" },
      { receipt_id: "segunda", product_id: "buzo" },
      { receipt_id: "primera", product_id: "campera" },
    ]);

    expect(grouped.get("primera")?.map((line) => line.product_id)).toEqual([
      "remera",
      "campera",
    ]);
    expect(grouped.get("segunda")?.map((line) => line.product_id)).toEqual([
      "buzo",
    ]);
  });

  it("devuelve un mapa vacío cuando no hay líneas", () => {
    expect(groupReceiptItems([]).size).toBe(0);
  });
});
