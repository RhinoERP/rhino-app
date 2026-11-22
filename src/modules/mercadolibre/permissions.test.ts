import { describe, expect, it } from "vitest";
import { canManageMeliAccounting } from "./permissions";

describe("Mercado Libre accounting access", () => {
  it("allows administrators and users with both accounting and payment access", () => {
    expect(canManageMeliAccounting(["organization.admin"])).toBe(true);
    expect(
      canManageMeliAccounting([
        "mercadolibre.accounting.manage",
        "mercadolibre.payments.read",
      ])
    ).toBe(true);
    expect(
      canManageMeliAccounting([
        "mercadolibre.accounting.manage",
        "mercadolibre.payments.manage",
      ])
    ).toBe(true);
  });

  it("requires both permissions for non-administrators", () => {
    expect(canManageMeliAccounting([])).toBe(false);
    expect(canManageMeliAccounting(["mercadolibre.accounting.manage"])).toBe(
      false
    );
    expect(canManageMeliAccounting(["mercadolibre.payments.read"])).toBe(false);
  });
});
