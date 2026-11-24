import { describe, expect, it } from "vitest";
import { getStockReadScope } from "./stock-read-scope";

describe("getStockReadScope", () => {
  it.each([
    "inventory.read",
    "inventory.read.all",
    "inventory.manage",
  ])("keeps %s users in the warehouse-scoped inventory view with Meli access", (permission) => {
    expect(getStockReadScope([permission, "mercadolibre.access"])).toBe(
      "inventory"
    );
  });

  it("limits users with only Meli access to the Meli stock view", () => {
    expect(getStockReadScope(["mercadolibre.access"])).toBe("mercadolibre");
  });
});
