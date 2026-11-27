import { describe, expect, it } from "vitest";
import { resolvePreSaleCustomerContext } from "./pre-sale-customer-context";

const sellers = [
  { user_id: "seller-a", is_active: true, disabled_at: null },
  { user_id: "seller-b", is_active: true, disabled_at: null },
];
const visibleCustomers = [
  { id: "customer-a", assigned_seller_id: "seller-a" },
  { id: "customer-b", assigned_seller_id: "seller-b" },
  { id: "customer-free", assigned_seller_id: null },
];

function resolve(
  requestedCustomerId: string,
  canAssignAnySeller = false,
  customers = visibleCustomers
) {
  return resolvePreSaleCustomerContext({
    requestedCustomerId,
    visibleCustomers: customers,
    sellers,
    userId: "seller-a",
    canAssignAnySeller,
  });
}

describe("pre-sale customer context", () => {
  it("preselects a visible customer for their seller", () => {
    expect(resolve("customer-a")).toEqual({
      customerId: "customer-a",
      sellerId: "seller-a",
    });
    expect(resolve("customer-free")).toEqual({
      customerId: "customer-free",
      sellerId: "seller-a",
    });
  });

  it("does not preselect invisible or foreign assigned customers", () => {
    expect(resolve("missing")).toEqual({ sellerId: "seller-a" });
    expect(resolve("customer-b")).toEqual({ sellerId: "seller-a" });
    expect(resolve("customer-a", false, [])).toEqual({ sellerId: "seller-a" });
  });

  it("uses an assigned seller only for staff with all-customer access", () => {
    expect(resolve("customer-b", true)).toEqual({
      customerId: "customer-b",
      sellerId: "seller-b",
    });
    expect(
      resolvePreSaleCustomerContext({
        requestedCustomerId: "customer-a",
        visibleCustomers,
        sellers: [sellers[1]],
        userId: "seller-b",
        canAssignAnySeller: true,
      })
    ).toEqual({ sellerId: "seller-b" });
    expect(
      resolvePreSaleCustomerContext({
        requestedCustomerId: "customer-b",
        visibleCustomers,
        sellers: [sellers[0], { ...sellers[1], is_active: false }],
        userId: "seller-a",
        canAssignAnySeller: true,
      })
    ).toEqual({ sellerId: "seller-a" });
  });
});
