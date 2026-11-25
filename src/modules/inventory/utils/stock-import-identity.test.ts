import { describe, expect, it } from "vitest";
import { normalizeData } from "@/lib/excel-parser";
import {
  resolveImportVariant,
  resolveImportWarehouse,
} from "./stock-import-identity";

const warehouses = [
  { id: "primary", name: "Principal" },
  { id: "branch", name: "Sucursal" },
];

describe("identidad de stock importado", () => {
  it("no usa el principal por defecto cuando hay varios depósitos", () => {
    expect(() => resolveImportWarehouse(warehouses, {})).toThrow(
      "Indicá el depósito"
    );
    expect(resolveImportWarehouse([warehouses[1]], {})).toBe("branch");
  });

  it("resuelve el nombre exacto sin distinguir mayúsculas ni espacios exteriores", () => {
    expect(
      resolveImportWarehouse(warehouses, { warehouse: " SUCURSAL " })
    ).toBe("branch");
  });

  it("requiere un ID si el nombre del depósito es ambiguo", () => {
    const duplicate = [warehouses[0], { id: "other", name: "Principal" }];
    expect(() =>
      resolveImportWarehouse(duplicate, { warehouse: "Principal" })
    ).toThrow("ambiguo");
    expect(resolveImportWarehouse(duplicate, { warehouse_id: "other" })).toBe(
      "other"
    );
  });

  it("rechaza IDs no asignados y nombres que contradicen el ID", () => {
    expect(() =>
      resolveImportWarehouse(warehouses, { warehouse_id: "revoked" })
    ).toThrow();
    expect(() =>
      resolveImportWarehouse(warehouses, {
        warehouse_id: "branch",
        warehouse: "Principal",
      })
    ).toThrow("no coincide");
  });

  it("identifica talle y color juntos, sin elegir otra variante", () => {
    const variants = [
      { id: "red-m", talle: "M", color: "Rojo" },
      { id: "blue-m", talle: "M", color: "Azul" },
    ];
    expect(
      resolveImportVariant(variants, { talle: " m ", color: " azul " })
    ).toBe("blue-m");
    expect(() => resolveImportVariant(variants, { talle: "M" })).toThrow(
      "talle y color"
    );
    expect(() =>
      resolveImportVariant(variants, { talle: "L", color: "Azul" })
    ).toThrow();
  });

  it("normaliza las nuevas columnas sin perder los IDs de depósito y lote", () => {
    const [row] = normalizeData([
      {
        Depósito: "Sucursal",
        "ID de depósito": "branch",
        "ID de lote": "lot-a",
        Talle: "M",
        Color: "Azul",
      },
    ]);
    expect(row).toMatchObject({
      warehouse: "Sucursal",
      warehouse_id: "branch",
      lot_id: "lot-a",
      talle: "M",
      color: "Azul",
    });
  });
});
