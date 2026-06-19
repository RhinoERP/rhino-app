import { describe, expect, it } from "vitest";
import {
  AnyEventoSchema,
  EventoCobroSchema,
  EventoFacturaCompraSchema,
  EventoFacturaVentaSchema,
} from "../eventos.schema";

const ventaBase = {
  tipoEvento: "FACTURA_VENTA" as const,
  orgId: "00000000-0000-0000-0000-000000000001",
  referenciaId: "00000000-0000-0000-0000-000000000002",
  referenciaTabla: "sales_orders" as const,
  fecha: "2026-06-09",
  descripcion: "Venta FAC-0001",
  idempotencyKey: "FACTURA_VENTA_00000000-0000-0000-0000-000000000002",
  datos: {
    tipoFactura: "MANUAL" as const,
    montoNeto: "1000.0000",
    montoImpuestos: "210.0000",
    totalFactura: "1210.0000",
    condicionVenta: "CONTADO" as const,
    clienteId: "00000000-0000-0000-0000-000000000003",
    facturaNumero: "A-0001-00000001",
  },
};

describe("EventoFacturaVentaSchema", () => {
  it("valida un evento de venta contado correcto", () => {
    expect(() => EventoFacturaVentaSchema.parse(ventaBase)).not.toThrow();
  });

  it("rechaza montos como numbers (regla crítica: siempre strings)", () => {
    const invalid = {
      ...ventaBase,
      datos: { ...ventaBase.datos, montoNeto: 1000 }, // number — debe fallar
    };
    expect(() => EventoFacturaVentaSchema.parse(invalid)).toThrow();
  });

  it("rechaza montos con formato inválido", () => {
    const invalid = {
      ...ventaBase,
      datos: { ...ventaBase.datos, montoNeto: "1.000,00" }, // formato europeo — debe fallar
    };
    expect(() => EventoFacturaVentaSchema.parse(invalid)).toThrow();
  });

  it("rechaza fecha con formato incorrecto", () => {
    expect(() =>
      EventoFacturaVentaSchema.parse({ ...ventaBase, fecha: "09/06/2026" })
    ).toThrow();
  });

  it("rechaza condicionVenta inválida", () => {
    const invalid = {
      ...ventaBase,
      datos: { ...ventaBase.datos, condicionVenta: "PLAZO" },
    };
    expect(() => EventoFacturaVentaSchema.parse(invalid)).toThrow();
  });
});

describe("EventoFacturaCompraSchema", () => {
  const compraBase = {
    tipoEvento: "FACTURA_COMPRA" as const,
    orgId: "00000000-0000-0000-0000-000000000001",
    referenciaId: "00000000-0000-0000-0000-000000000010",
    referenciaTabla: "purchase_orders" as const,
    fecha: "2026-06-09",
    descripcion: "Compra proveedor X",
    idempotencyKey: "FACTURA_COMPRA_00000000-0000-0000-0000-000000000010",
    datos: {
      montoNeto: "5000.0000",
      montoImpuestos: "1050.0000",
      totalFactura: "6050.0000",
      condicionCompra: "CREDITO" as const,
      proveedorId: "00000000-0000-0000-0000-000000000020",
      facturaNumero: "B-0001-00000100",
    },
  };

  it("valida una compra a crédito sin campos opcionales de impuestos", () => {
    expect(() => EventoFacturaCompraSchema.parse(compraBase)).not.toThrow();
  });

  it("acepta montoIIBB opcional cuando está presente", () => {
    const conIIBB = {
      ...compraBase,
      datos: { ...compraBase.datos, montoIIBB: "150.0000" },
    };
    expect(() => EventoFacturaCompraSchema.parse(conIIBB)).not.toThrow();
  });
});

describe("EventoCobroSchema", () => {
  it("valida un cobro por transferencia", () => {
    const cobro = {
      tipoEvento: "COBRO" as const,
      orgId: "00000000-0000-0000-0000-000000000001",
      referenciaId: "00000000-0000-0000-0000-000000000030",
      referenciaTabla: "receivable_payments" as const,
      fecha: "2026-06-09",
      descripcion: "Cobro cliente Y",
      idempotencyKey: "COBRO_00000000-0000-0000-0000-000000000030",
      datos: {
        montoCobrado: "1210.0000",
        metodoPago: "TRANSFERENCIA" as const,
        clienteId: "00000000-0000-0000-0000-000000000003",
      },
    };
    expect(() => EventoCobroSchema.parse(cobro)).not.toThrow();
  });

  it("rechaza método de pago inválido", () => {
    const invalid = {
      tipoEvento: "COBRO",
      datos: { metodoPago: "TARJETA" },
    };
    expect(() => EventoCobroSchema.parse(invalid)).toThrow();
  });
});

describe("AnyEventoSchema (discriminated union)", () => {
  it("resuelve FACTURA_VENTA correctamente", () => {
    const result = AnyEventoSchema.parse(ventaBase);
    expect(result.tipoEvento).toBe("FACTURA_VENTA");
  });

  it("rechaza tipoEvento desconocido", () => {
    expect(() =>
      AnyEventoSchema.parse({ ...ventaBase, tipoEvento: "DEVOLUCION" })
    ).toThrow();
  });
});
