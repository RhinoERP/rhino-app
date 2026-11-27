import { describe, expect, it } from "vitest";
import { filterSearchableCatalog } from "./searchable-catalog";

const options = [
  { value: "1", label: "Ñandú Azul", searchText: "SKU-102" },
  { value: "2", label: "Nandu Verde", searchText: "SKU-205" },
  { value: "3", label: "Producto Gris", searchText: "gris 305" },
];

describe("searchable catalog", () => {
  it("finds accent-insensitive names and SKU tokens", () => {
    expect(
      filterSearchableCatalog(options, "NANDU 102").map((item) => item.value)
    ).toEqual(["1"]);
    expect(
      filterSearchableCatalog(options, "sku 205").map((item) => item.value)
    ).toEqual(["2"]);
  });

  it("shows a bounded list before searching", () => {
    expect(filterSearchableCatalog(options, "", 2)).toHaveLength(2);
    expect(filterSearchableCatalog(options, "inexistente")).toEqual([]);
  });

  it("limits a large matching catalog without excluding late matches", () => {
    const catalog = Array.from({ length: 2000 }, (_, index) => ({
      value: String(index),
      label: `Artículo ${index}`,
    }));
    expect(filterSearchableCatalog(catalog, "articulo")).toHaveLength(40);
    expect(filterSearchableCatalog(catalog, "articulo 1999")).toEqual([
      catalog[1999],
    ]);
  });
});
