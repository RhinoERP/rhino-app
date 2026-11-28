import { expect, it } from "vitest";
import { read, utils, write } from "xlsx";
import {
  normalizePriceListDiscountCells,
  parsePriceListRow,
} from "./price-list-import";

it("importa los cinco porcentajes y normaliza los vacíos", () => {
  expect(
    parsePriceListRow(
      {
        SKU: "CAM-001",
        Precio: 104_000,
        "Descuento 1": "10%",
        "Descuento 2": "2,5",
        "Descuento 3": "",
      },
      "sequential"
    )
  ).toMatchObject({
    sku: "CAM-001",
    price: 104_000,
    discount_1_percentage: 10,
    discount_2_percentage: 2.5,
    discount_3_percentage: 0,
    discount_4_percentage: 0,
    discount_5_percentage: 0,
  });
});
it("no interpreta columnas de descuentos en una organización sin la función", () => {
  expect(
    parsePriceListRow({ SKU: "A", Precio: 100, "Descuento 1": "inválido" })
  ).toEqual({ sku: "A", price: 100, currency: "ARS" });
});
it("identifica el SKU de una suma o un porcentaje inválido", () => {
  expect(() =>
    parsePriceListRow(
      { SKU: "A", Precio: 100, "Descuento 1": 60, "Descuento 2": 40 },
      "additive"
    )
  ).toThrow("SKU A");
  expect(() =>
    parsePriceListRow(
      { SKU: "A", Precio: 100, "Descuento 1": "inválido" },
      "sequential"
    )
  ).toThrow("entre 0 y 100%");
});

it("interpreta porcentajes formateados en Excel y mantiene los números de porcentaje sin formato", () => {
  const sheet = {
    C1: { t: "s", v: "Descuento 1" },
    C2: { t: "n", v: 0.1, z: "0%" },
    C3: { t: "n", v: 10 },
  };
  normalizePriceListDiscountCells(sheet);
  expect(sheet.C2.v).toBe(10);
  expect(sheet.C3.v).toBe(10);
});

it.each([
  '0"%"',
  "0\\%",
  "_%0",
  '[Red]0"%"',
])("no escala porcentajes literales de Excel con formato %s", (format) => {
  const sheet = utils.aoa_to_sheet([
    ["SKU", "Precio", "Descuento 1"],
    ["A", 100, 10],
  ]);
  sheet.C2.z = format;
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Precios");
  const restored = read(write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
    cellNF: true,
  });
  const worksheet = restored.Sheets.Precios;
  normalizePriceListDiscountCells(worksheet);
  const row = utils.sheet_to_json<Record<string, unknown>>(worksheet)[0];
  expect(parsePriceListRow(row, "sequential")?.discount_1_percentage).toBe(10);
});

it.each([
  "0%",
  "0.00%",
])("escala el operador porcentual real de un archivo Excel con formato %s", (format) => {
  const sheet = utils.aoa_to_sheet([
    ["SKU", "Precio", "Descuento 1"],
    ["A", 100, 0.1],
  ]);
  sheet.C2.z = format;
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Precios");
  const restored = read(write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
    cellNF: true,
  });
  normalizePriceListDiscountCells(restored.Sheets.Precios);
  const row = utils.sheet_to_json<Record<string, unknown>>(
    restored.Sheets.Precios
  )[0];
  expect(parsePriceListRow(row, "sequential")?.discount_1_percentage).toBe(10);
});
