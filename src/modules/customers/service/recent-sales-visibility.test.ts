import { describe, expect, it } from "vitest";
import { canOpenCustomerSale } from "./recent-sales-visibility";

describe("recent customer sales visibility", () => {
  const ownAccess = {
    canRead: true,
    scope: "own" as const,
    userId: "seller-1",
  };

  it("allows sales created by the seller with own-sales access", () => {
    expect(canOpenCustomerSale({ user_id: "seller-1" }, ownAccess)).toBe(true);
  });

  it("does not link sales that the detail page would reject", () => {
    expect(canOpenCustomerSale({ user_id: "seller-2" }, ownAccess)).toBe(false);
    expect(canOpenCustomerSale({ user_id: null }, ownAccess)).toBe(false);
    expect(
      canOpenCustomerSale(
        { user_id: "seller-1" },
        { ...ownAccess, canRead: false }
      )
    ).toBe(false);
  });

  it("allows sales from any seller with all-sales access", () => {
    expect(
      canOpenCustomerSale(
        { user_id: "seller-2" },
        { canRead: true, scope: "all", userId: "seller-1" }
      )
    ).toBe(true);
  });
});
