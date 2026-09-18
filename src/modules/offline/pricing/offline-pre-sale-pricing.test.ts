import { describe, expect, it } from "vitest";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import { buildOfflineProductPriceMap } from "./offline-pre-sale-pricing";

describe("offline pre-sale pricing", () => {
  it("aplica la lista general asignada al cliente", () => {
    const snapshot = {
      customers: [
        {
          id: "customer-1",
          salesPriceListId: "list-1",
        },
      ],
      products: [
        {
          id: "product-1",
          price: 100,
          supplierId: null,
        },
      ],
      salesPriceLists: [
        {
          id: "list-1",
          type: "PERCENTAGE",
          value: 10,
        },
      ],
      customerPriceAssignments: [],
      purchasePriceListItems: [],
    } as unknown as SellerOfflineSnapshotV1;

    expect(
      buildOfflineProductPriceMap(snapshot, "customer-1").get("product-1")
    ).toBe(110);
  });
});
