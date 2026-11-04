import { describe, expect, it } from "vitest";
import {
  resolveProductImportSupplier,
  resolveProductImportVariants,
} from "./product-import-validation";

describe("product import suppliers", () => {
  const suppliers = [{ id: "macata", name: "MACATA" }];

  it("resolves a supplied name with case and whitespace normalization", () => {
    expect(resolveProductImportSupplier(" macata ", suppliers)).toEqual({
      supplierId: "macata",
    });
  });

  it("retains optional empty suppliers without creating one", () => {
    expect(resolveProductImportSupplier("  ", suppliers)).toEqual({
      supplierId: undefined,
    });
    expect(resolveProductImportSupplier(null, suppliers)).toEqual({
      supplierId: undefined,
    });
  });

  it("rejects a named supplier that does not exist instead of silently dropping it", () => {
    expect(
      resolveProductImportSupplier("LIQUIDACION", suppliers)
    ).toMatchObject({ error: expect.stringContaining("no existe") });
  });

  it("rejects ambiguous normalized names instead of choosing the first", () => {
    expect(
      resolveProductImportSupplier("macata", [
        ...suppliers,
        { id: "other", name: "Macata " },
      ])
    ).toMatchObject({ error: expect.stringContaining("ambiguo") });
  });
});

describe("product import variant classification", () => {
  it.each([
    ["UNICO", ""],
    ["", "Rojo"],
    ["8,9", undefined],
    [null, null],
  ])("treats a missing dimension as a simple product", (sizes, colors) => {
    expect(resolveProductImportVariants(sizes, colors)).toEqual({
      hasVariants: false,
      talles: [],
      colores: [],
    });
  });

  it("creates variants only from two populated dimensions and deduplicates normalized values", () => {
    expect(
      resolveProductImportVariants(
        " m, L, M ",
        " azul  marino, ROJO, azul marino "
      )
    ).toEqual({
      hasVariants: true,
      talles: ["M", "L"],
      colores: ["Azul Marino", "Rojo"],
    });
  });

  it("keeps comma-separated numeric sizes as distinct text sizes including zero", () => {
    expect(resolveProductImportVariants("0,1", "Negro")).toMatchObject({
      hasVariants: true,
      talles: ["0", "1"],
    });
    expect(resolveProductImportVariants("8,9", "Negro")).toMatchObject({
      talles: ["8", "9"],
    });
    expect(resolveProductImportVariants("10,11", "Negro")).toMatchObject({
      talles: ["10", "11"],
    });
    expect(resolveProductImportVariants(0, "Negro")).toMatchObject({
      hasVariants: true,
      talles: ["0"],
    });
  });

  it("does not reinterpret an Excel decimal as a size list without correction of the source cell", () => {
    expect(resolveProductImportVariants(8.9, "Azul")).toMatchObject({
      error: expect.stringContaining("texto"),
    });
    expect(resolveProductImportVariants("10.5", "Azul")).toMatchObject({
      talles: ["10.5"],
    });
  });

  it("rejects two populated but empty token lists", () => {
    expect(resolveProductImportVariants(",,,", "Azul")).toHaveProperty("error");
  });

  it("validates the database's variant limits before creating the product", () => {
    expect(resolveProductImportVariants("M", "A".repeat(51))).toHaveProperty(
      "error"
    );
    const sizes = Array.from({ length: 101 }, (_, index) => String(index)).join(
      ","
    );
    const colors = Array.from(
      { length: 10 },
      (_, index) => `Color ${index}`
    ).join(",");
    expect(resolveProductImportVariants(sizes, colors)).toMatchObject({
      error: expect.stringContaining("1000"),
    });
  });
});
