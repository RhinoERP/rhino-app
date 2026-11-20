import { describe, expect, it } from "vitest";
import type { PriceLevel } from "@/modules/price-levels/types";
import {
  isCancel,
  lineFor,
  type OrderProduct,
  orderSummary,
  type PricingRules,
  unitPriceFor,
} from "./order-lines";

const cheese: OrderProduct = {
  id: "p1",
  name: "CREMOSO CREMAC",
  sku: "CR1",
  supplierId: "s1",
  basePrice: 1000,
  costPrice: 800,
  unitOfMeasure: "KG",
  tracksStockUnits: true,
  weightPerUnit: 4,
  hasVariants: false,
};

const unitProduct: OrderProduct = {
  ...cheese,
  id: "p2",
  name: "Dulce de leche 1kg",
  unitOfMeasure: "UN",
  tracksStockUnits: false,
  weightPerUnit: null,
};

const noRules: PricingRules = {
  fallback: { level: null, adjustments: [] },
  bySupplier: new Map(),
  supplierCosts: new Map(),
};

const level = { id: "l1", margin: 50 } as PriceLevel;

describe("unitPriceFor", () => {
  it("usa el precio base si el cliente no tiene lista", () => {
    expect(unitPriceFor(cheese, noRules)).toBe(1000);
  });

  it("aplica el nivel y la lista especial del cliente", () => {
    const rules: PricingRules = {
      ...noRules,
      fallback: {
        level,
        adjustments: [{ type: "PERCENTAGE", value: -10 }],
      },
    };
    // 800 × 1,5 = 1200, menos 10 % = 1080
    expect(unitPriceFor(cheese, rules)).toBe(1080);
  });

  it("la asignación por proveedor manda sobre la del cliente", () => {
    const rules: PricingRules = {
      ...noRules,
      bySupplier: new Map([["s1", { level, adjustments: [] }]]),
      supplierCosts: new Map([["s1", new Map([["p1", 600]])]]),
    };
    expect(unitPriceFor(cheese, rules)).toBe(900);
  });
});

describe("lineFor", () => {
  it("piezas de un producto por peso: kilos aproximados por el peso promedio", () => {
    const line = lineFor(cheese, 5, true, 1000);
    expect(line).toMatchObject({
      quantity: 5,
      weightQuantity: 20,
      estimated: true,
      subtotal: 20_000,
    });
  });

  it("kilos de un producto por peso: calcula las piezas", () => {
    const line = lineFor(cheese, 10, false, 1000);
    expect(line).toMatchObject({
      quantity: 3,
      weightQuantity: 10,
      estimated: false,
      subtotal: 10_000,
    });
  });

  it("unidades enteras para productos por unidad", () => {
    expect(lineFor(unitProduct, 12, false, 500)).toMatchObject({
      quantity: 12,
      weightQuantity: null,
      subtotal: 6000,
    });
  });

  it("rechaza cantidades inválidas o piezas sin peso cargado", () => {
    expect(() => lineFor(unitProduct, 0, false, 500)).toThrow();
    expect(() =>
      lineFor({ ...cheese, weightPerUnit: null }, 5, true, 1000)
    ).toThrow("peso por pieza");
  });
});

describe("orderSummary", () => {
  it("muestra cliente, líneas, total y cómo confirmar", () => {
    const text = orderSummary({
      customerName: "PENDINO SRL",
      lines: [lineFor(cheese, 5, true, 1000)],
      total: 24_200,
      note: "Entregar el jueves",
    });
    expect(text).toContain("*Pedido para Pendino SRL*");
    expect(text).toContain("Cremoso Cremac · 5 piezas, ~20 kg");
    expect(text).toContain("aprox.");
    expect(text).toContain("Nota: Entregar el jueves");
    expect(text).toContain("*sí*");
  });
});

describe("isCancel", () => {
  it("reconoce cancelaciones simples", () => {
    expect(isCancel("Cancelar")).toBe(true);
    expect(isCancel("no.")).toBe(true);
    expect(isCancel("no, mejor 6")).toBe(false);
  });
});
