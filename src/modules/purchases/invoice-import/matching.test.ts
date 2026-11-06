import { describe, expect, it } from "vitest";
import {
  aliasKey,
  daysToDue,
  itemFromLine,
  matchLine,
  matchSupplier,
  vatRates,
} from "./matching";
import type { ExtractedInvoice, ExtractedInvoiceLine } from "./schema";

const line = (
  overrides: Partial<ExtractedInvoiceLine> = {}
): ExtractedInvoiceLine => ({
  codigo: null,
  descripcion: "QUESO CREMOSO CREMAC X KG",
  cantidad: 12.5,
  unidad: "KG",
  precio_unitario: 8000,
  descuento_porcentaje: 0,
  subtotal: 100_000,
  alicuota_iva: 21,
  ...overrides,
});

const products = [
  { id: "p1", name: "Cremoso Cremac", sku: "CR-01", brand: "Cremac" },
  { id: "p2", name: "Muzzarella Cremac", sku: "MZ-02", brand: "Cremac" },
  { id: "p3", name: "Dulce de leche 1 kg", sku: null, brand: "La Serenísima" },
];

describe("matchSupplier", () => {
  const suppliers = [
    { id: "s1", name: "Lácteos Cremac S.A.", cuit: "30-71234567-8" },
    { id: "s2", name: "Distribuidora Norte", cuit: null },
  ];

  it("encuentra al proveedor por CUIT aunque venga con guiones", () => {
    expect(
      matchSupplier({ nombre: "X", cuit: "30712345678" }, suppliers)
    ).toEqual({ supplierId: "s1", how: "cuit" });
  });

  it("si no hay CUIT, por nombre; nunca el CUIT del comprador", () => {
    expect(
      matchSupplier(
        { nombre: "DISTRIBUIDORA NORTE SRL", cuit: "20111111112" },
        suppliers,
        "20-11111111-2"
      )
    ).toEqual({ supplierId: "s2", how: "nombre" });
    expect(
      matchSupplier({ nombre: "Otro proveedor", cuit: null }, suppliers)
    ).toEqual({ supplierId: null, how: null });
  });
});

describe("matchLine", () => {
  it("usa primero lo recordado, después el código y después el nombre", () => {
    const remembered = new Map([[aliasKey(line()), "p2"]]);
    expect(matchLine(line(), products, remembered)).toMatchObject({
      productId: "p2",
      how: "recordado",
    });
    expect(
      matchLine(line({ codigo: "cr 01" }), products, new Map())
    ).toMatchObject({ productId: "p1", how: "codigo" });
    expect(matchLine(line(), products, new Map())).toMatchObject({
      productId: "p1",
      how: "nombre",
    });
  });

  it("no adivina cuando no está claro y deja sugerencias", () => {
    const result = matchLine(
      line({ descripcion: "Producto Cremac" }),
      products,
      new Map()
    );
    expect(result.productId).toBeNull();
    expect(result.candidates).toEqual(expect.arrayContaining(["p1", "p2"]));
  });
});

describe("itemFromLine", () => {
  const cheese = {
    id: "p1",
    name: "Cremoso Cremac",
    unit_of_measure: "KG",
    weight_per_unit: 4,
    units_per_box: null,
  };

  it("kilos de un producto por peso: piezas por el peso promedio y costo por kilo", () => {
    expect(itemFromLine(line(), cheese)).toMatchObject({
      quantity: 3.125,
      total_weight_kg: 12.5,
      unit_cost: 8000,
      price_per_kg: 8000,
      subtotal: 100_000,
    });
  });

  it("cajas a unidades", () => {
    const item = itemFromLine(
      line({ unidad: "CAJA", cantidad: 2, precio_unitario: 12_000 }),
      {
        id: "p3",
        name: "Dulce de leche 1 kg",
        unit_of_measure: "UN",
        weight_per_unit: null,
        units_per_box: 12,
      }
    );
    expect(item).toMatchObject({
      quantity: 24,
      unit_cost: 1000,
      subtotal: 24_000,
    });
  });

  it("aplica la bonificación de la línea", () => {
    const item = itemFromLine(
      line({
        unidad: "UN",
        cantidad: 10,
        precio_unitario: 100,
        descuento_porcentaje: 10,
      }),
      {
        id: "p3",
        name: "Dulce",
        unit_of_measure: "UN",
        weight_per_unit: null,
        units_per_box: null,
      }
    );
    expect(item.subtotal).toBe(900);
  });
});

describe("datos generales", () => {
  it("calcula los días al vencimiento", () => {
    expect(daysToDue("2026-11-01", "2026-12-01")).toBe(30);
    expect(daysToDue("2026-11-01", null)).toBeNull();
  });

  it("toma las alícuotas de IVA y no las percepciones", () => {
    const invoice = {
      impuestos: [
        { nombre: "IVA 21%", alicuota: 21, importe: 210 },
        { nombre: "IVA 10,5%", alicuota: 10.5, importe: 10.5 },
        { nombre: "Percepción IVA", alicuota: 3, importe: 30 },
      ],
    } as ExtractedInvoice;
    expect(vatRates(invoice)).toEqual([21, 10.5]);
  });
});
