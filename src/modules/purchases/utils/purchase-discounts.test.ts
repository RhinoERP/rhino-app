import { describe, expect, it } from "vitest";
import { truncateMoney } from "@/lib/decimal";
import {
  calculateHabitualPurchaseCost,
  calculateHabitualUnitCost,
  calculatePostInvoiceCost,
  getPurchaseDiscountDetails,
  serializePurchaseDiscountDetails,
  updatePurchaseListCost,
  validateHabitualDiscounts,
} from "./purchase-discounts";

describe("descuentos de compra", () => {
  it("distingue la suma del escalonado y trata vacíos como cero", () => {
    const discounts = {
      discount_1_percentage: 10,
      discount_2_percentage: 20,
      discount_3_percentage: null,
    };
    expect(
      calculateHabitualPurchaseCost(100, "additive", discounts)
    ).toBeCloseTo(70);
    expect(
      calculateHabitualPurchaseCost(100, "sequential", discounts)
    ).toBeCloseTo(72);
    expect(calculateHabitualPurchaseCost(100, "sequential", {})).toBe(100);
  });
  it("rechaza sumas iguales o mayores a 100% pero permite 100% individual escalonado", () => {
    for (const value of [50, 60]) {
      expect(() =>
        validateHabitualDiscounts(
          { discount_1_percentage: 50, discount_2_percentage: value },
          "additive"
        )
      ).toThrow("menor al 100%");
    }
    expect(
      calculateHabitualPurchaseCost(100, "sequential", {
        discount_1_percentage: 100,
      })
    ).toBe(0);
    for (const value of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        validateHabitualDiscounts(
          { discount_1_percentage: value },
          "sequential"
        )
      ).toThrow();
    }
  });
  it("conserva intermedios y trunca una sola vez el costo neto final", () => {
    const raw = calculateHabitualPurchaseCost(100.01, "sequential", {
      discount_1_percentage: 1,
      discount_2_percentage: 1,
    });
    expect(raw).toBeCloseTo(98.019_801, 8);
    expect(truncateMoney(raw)).toBe(98.01);
  });
  it("convierte el precio de CAJA una sola vez y conserva las unidades sueltas", () => {
    expect(
      calculateHabitualUnitCost(
        13_000,
        { discount_1_percentage: 10 },
        "CAJA",
        8
      )
    ).toBe(11_700);
    const line = updatePurchaseListCost(
      {
        quantity: 77,
        unit_quantity: 77,
        unit_cost: 0,
        subtotal: 0,
        unit_of_measure: "CAJA",
        units_per_box: 8,
        discount_1_percentage: 10,
      },
      13_000
    );
    expect(line.unit_cost).toBe(11_700);
    expect(line.subtotal).toBe(900_900);
    expect(line.quantity).toBe(77);
  });
  it("los tres post factura son escalonados sobre la base configurada", () => {
    const details = {
      post_invoice_prompt_payment_discount_percentage: 10,
      post_invoice_volume_discount_percentage: 20,
      post_invoice_goods_discount_percentage: 30,
    };
    expect(calculatePostInvoiceCost(1000, 210, details)).toEqual({
      base: 1000,
      cost: 504,
      discountAmount: 496,
    });
    expect(
      calculatePostInvoiceCost(1000, 210, {
        ...details,
        post_invoice_discounts_include_taxes: true,
      })
    ).toEqual({ base: 1210, cost: 609.84, discountAmount: 600.16 });
  });
  it("serializa solo los datos de descuento y respeta los datos históricos", () => {
    expect(getPurchaseDiscountDetails({})).toEqual({});
    const result = getPurchaseDiscountDetails({
      list_unit_cost: 100,
      discount_1_percentage: 5,
      post_invoice_discounts_include_taxes: true,
    });
    expect(result).toMatchObject({
      list_unit_cost: 100,
      discount_1_percentage: 5,
      post_invoice_volume_discount_percentage: 0,
      post_invoice_discounts_include_taxes: true,
    });
    expect(result).not.toHaveProperty("subtotal");
  });
  it("conserva la base con impuestos aunque los porcentajes post factura se vuelvan a cero", () => {
    const details = getPurchaseDiscountDetails({
      post_invoice_volume_discount_percentage: 0,
      post_invoice_discounts_include_taxes: true,
    });
    expect(details.post_invoice_discounts_include_taxes).toBe(true);
    expect(calculatePostInvoiceCost(100, 21, details).cost).toBe(121);
  });
  it("envía ceros explícitos al quitar el último descuento de una línea guardada", () => {
    expect(serializePurchaseDiscountDetails({})).toEqual({});
    expect(
      serializePurchaseDiscountDetails({
        list_unit_cost: null,
        post_invoice_volume_discount_percentage: 0,
      })
    ).toMatchObject({
      list_unit_cost: null,
      post_invoice_volume_discount_percentage: 0,
      post_invoice_discounts_include_taxes: false,
    });
  });
});
