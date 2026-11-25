import { describe, expect, it } from "vitest";
import { customerSellerScopeFilter } from "./customer-visibility";

describe("seller customer visibility", () => {
  it("includes owned and unassigned customers without selecting other sellers", () => {
    expect(customerSellerScopeFilter("seller-id")).toBe(
      "assigned_seller_id.eq.seller-id,assigned_seller_id.is.null"
    );
  });
});
