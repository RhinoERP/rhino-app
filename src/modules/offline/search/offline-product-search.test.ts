import { describe, expect, it } from "vitest";
import { searchOfflineProducts } from "./offline-product-search";

const products = [
  {
    id: "metadata",
    name: "Almacén mixto",
    sku: "M-10",
    brand: "Río",
    supplierName: "Casa Ruiz",
    categoryName: "Abarrotes",
  },
  {
    id: "name-late",
    name: "Ruiz Naranja",
    sku: "J-20",
    brand: "Sol",
    supplierName: "Proveedor 2",
    categoryName: "Bebidas",
  },
  {
    id: "sku",
    name: "Jugo cítrico",
    sku: "RUIZ-001",
    brand: "Sol",
    supplierName: "Proveedor 2",
    categoryName: "Bebidas",
  },
  {
    id: "name-first",
    name: "Ruiz Limón",
    sku: "J-10",
    brand: "Sol",
    supplierName: "Proveedor 2",
    categoryName: "Bebidas",
  },
  {
    id: "contains",
    name: "Jugo Ruizado",
    sku: "J-30",
    brand: null,
    supplierName: null,
    categoryName: null,
  },
];

describe("offline catalog search", () => {
  it("ranks SKU and name matches before supplier/brand metadata hits", () => {
    expect(searchOfflineProducts(products, "ruiz").map(({ id }) => id)).toEqual(
      ["sku", "name-late", "name-first", "contains", "metadata"]
    );
  });

  it("matches accents, multiple terms and SKU punctuation", () => {
    expect(
      searchOfflineProducts(products, "Jugo citrico").map(({ id }) => id)
    ).toEqual(["sku"]);
    expect(
      searchOfflineProducts(products, "ruiz 001").map(({ id }) => id)
    ).toEqual(["sku"]);
  });

  it("returns the original products for an empty query and an empty result for no match", () => {
    expect(searchOfflineProducts(products, "   ")).toBe(products);
    expect(searchOfflineProducts(products, "no-existe")).toEqual([]);
  });
});
