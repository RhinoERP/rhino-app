import { describe, expect, it } from "vitest";
import { searchPreSaleCustomers } from "./pre-sale-customer-search";

const customers = [
  {
    business_name: "Distribuidora Asziel",
    fantasy_name: null,
    city: "Ruiz",
    address: null,
  },
  {
    business_name: "Ruíz Mayorista",
    fantasy_name: null,
    city: null,
    address: null,
  },
  {
    business_name: "Super Ruiz",
    fantasy_name: null,
    city: null,
    address: null,
  },
  {
    business_name: "Otro",
    fantasy_name: null,
    city: "Resistencia",
    address: "Calle Ruiz",
  },
];

describe("customer search in new pre-sale", () => {
  it("places customer names before matches in the address without fuzzy reordering", () => {
    expect(
      searchPreSaleCustomers(customers, "Ruiz").map(
        (customer) => customer.business_name
      )
    ).toEqual(["Ruíz Mayorista", "Super Ruiz", "Distribuidora Asziel", "Otro"]);
  });

  it("preserves the original list until the user searches and returns no matches when appropriate", () => {
    expect(searchPreSaleCustomers(customers, " ")).toBe(customers);
    expect(searchPreSaleCustomers(customers, "inexistente")).toEqual([]);
  });
});
