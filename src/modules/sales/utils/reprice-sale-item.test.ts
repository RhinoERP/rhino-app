import { describe, expect, it } from "vitest";
import { truncateMoney } from "@/lib/decimal";
import { normalizeCaseUnitQuantity } from "@/modules/inventory/utils/case-units";
import { repriceSaleItem } from "./reprice-sale-item";

const campari = {
  type: "product",
  productId: "CAM-001",
  unitOfMeasure: "CAJA",
  unitsPerBox: 8,
  quantity: normalizeCaseUnitQuantity({ boxes: 6, units: 13 }, 8),
  unitPrice: 135_200 / 8,
  basePrice: 135_200 / 8,
};

describe("sale line repricing", () => {
  it("keeps CAM-001 at its individual price when the add-item effect runs", () => {
    const item = repriceSaleItem(campari, 135_200);
    expect(item).toBe(campari);
    expect(item.quantity).toBe(61);
    expect(item.unitPrice * item.unitsPerBox).toBe(135_200);
    expect(truncateMoney(item.quantity * item.unitPrice)).toBe(1_030_900);
  });

  it("converts customer/list changes exactly once and preserves prices after reload", () => {
    const updated = repriceSaleItem(campari, 148_720);
    expect(updated.unitPrice).toBe(18_590);
    expect(updated.basePrice).toBe(18_590);
    expect(updated.quantity).toBe(61);
    const reloaded = JSON.parse(JSON.stringify(updated));
    expect(repriceSaleItem(reloaded, 148_720)).toBe(reloaded);
    expect(truncateMoney(updated.quantity * updated.unitPrice)).toBe(1_133_990);
  });

  it("does not ignore a one-cent change to a box price", () => {
    const updated = repriceSaleItem(campari, 135_200.01);
    expect(updated.unitPrice).toBe(135_200.01 / 8);
  });

  it.each([
    "KG",
    "LT",
    "MT",
  ])("preserves measured-unit pricing for %s", (unitOfMeasure) => {
    expect(
      repriceSaleItem({ ...campari, unitOfMeasure, pricePerKg: 10 }, 20)
    ).toMatchObject({ unitPrice: 20, basePrice: 20, pricePerKg: 20 });
  });

  it("preserves the legacy reference price for UN and leaves adjustments alone", () => {
    const unit = { ...campari, unitOfMeasure: "UN", basePrice: 10 };
    expect(repriceSaleItem(unit, 20)).toMatchObject({
      unitPrice: 20,
      basePrice: 10,
    });
    const adjustment = { ...campari, type: "adjustment" };
    expect(repriceSaleItem(adjustment, 20)).toBe(adjustment);
  });
});
