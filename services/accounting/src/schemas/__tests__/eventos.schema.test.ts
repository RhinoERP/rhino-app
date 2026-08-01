import { describe, expect, it } from "vitest";
import {
  AnyEventoSchema,
  EventoAsientoManualSchema,
  EventoCobroSchema,
  EventoFacturaCompraSchema,
  EventoFacturaVentaSchema,
  EventoNcCompraSchema,
  EventoNdVentaSchema,
  EventoOrdenPagoSchema,
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

describe("EventoNcCompraSchema", () => {
  it("valida una nota de crédito de compra", () => {
    const ncCompra = {
      tipoEvento: "NC_COMPRA" as const,
      orgId: "00000000-0000-0000-0000-000000000001",
      referenciaId: "00000000-0000-0000-0000-000000000010",
      referenciaTabla: "purchase_orders" as const,
      fecha: "2026-06-09",
      descripcion: "NC proveedor X",
      idempotencyKey: "NC_COMPRA_00000000-0000-0000-0000-000000000011",
      datos: {
        montoNeto: "1000.0000",
        montoImpuestos: "210.0000",
        totalFactura: "1210.0000",
        proveedorId: "00000000-0000-0000-0000-000000000020",
        facturaNumero: "NC-B-0001-00000100",
      },
    };

    expect(() => EventoNcCompraSchema.parse(ncCompra)).not.toThrow();
  });
});

describe("EventoNdVentaSchema", () => {
  it("valida una nota de débito de venta con líneas e impuestos", () => {
    const debitNote = {
      tipoEvento: "ND_VENTA" as const,
      orgId: "00000000-0000-0000-0000-000000000001",
      referenciaId: "00000000-0000-0000-0000-000000000015",
      referenciaTabla: "debit_notes" as const,
      fecha: "2026-08-01",
      descripcion: "Nota de debito venta ND-1",
      idempotencyKey: "ND_VENTA_00000000-0000-0000-0000-000000000015",
      datos: {
        totalFactura: "1230.0000",
        montoNeto: "1000.0000",
        montoImpuestos: "230.0000",
        clienteId: "00000000-0000-0000-0000-000000000003",
        ventaId: "00000000-0000-0000-0000-000000000004",
        lineasDesglosadas: [
          {
            accountCode: null,
            montoNeto: "1000.0000",
            impuestos: [
              { monto: "210.0000", taxCode: "IVA_21" },
              {
                monto: "20.0000",
                taxCode: "TRIBUTO_02",
                accountCode: "TRIBUTOS_A_PAGAR",
              },
            ],
          },
        ],
      },
    };

    expect(() => EventoNdVentaSchema.parse(debitNote)).not.toThrow();
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

describe("EventoOrdenPagoSchema", () => {
  it("valida una orden de pago con banco informado", () => {
    const ordenPago = {
      tipoEvento: "ORDEN_PAGO" as const,
      orgId: "00000000-0000-0000-0000-000000000001",
      referenciaId: "00000000-0000-0000-0000-000000000040",
      referenciaTabla: "payable_payments" as const,
      fecha: "2026-06-09",
      descripcion: "Pago proveedor Z",
      idempotencyKey: "ORDEN_PAGO_00000000-0000-0000-0000-000000000040",
      datos: {
        monto: "2500.0000",
        metodoPago: "TRANSFERENCIA" as const,
        proveedorId: "00000000-0000-0000-0000-000000000020",
        facturaId: "00000000-0000-0000-0000-000000000010",
        bancoAccountCode: "BANCO_BBVA_PESOS",
      },
    };

    expect(() => EventoOrdenPagoSchema.parse(ordenPago)).not.toThrow();
  });
});

describe("EventoAsientoManualSchema", () => {
  const manualBase = {
    tipoEvento: "ASIENTO_MANUAL" as const,
    orgId: "00000000-0000-0000-0000-000000000001",
    referenciaId: "00000000-0000-0000-0000-000000000099",
    referenciaTabla: "manual" as const,
    fecha: "2026-06-09",
    descripcion: "Asiento manual - Ajuste de caja",
    idempotencyKey: "MANUAL_00000000-0000-0000-0000-000000000099",
    datos: {
      referenciaLibre: "Ajuste cierre Z",
    },
  };

  it("valida un asiento manual con referencia libre opcional", () => {
    expect(() => EventoAsientoManualSchema.parse(manualBase)).not.toThrow();
  });

  it("rechaza una referenciaTabla distinta de manual", () => {
    expect(() =>
      EventoAsientoManualSchema.parse({
        ...manualBase,
        referenciaTabla: "sales_orders",
      })
    ).toThrow();
  });
});

describe("AnyEventoSchema (discriminated union)", () => {
  it("resuelve FACTURA_VENTA correctamente", () => {
    const result = AnyEventoSchema.parse(ventaBase);
    expect(result.tipoEvento).toBe("FACTURA_VENTA");
  });

  it("resuelve ASIENTO_MANUAL correctamente", () => {
    const result = AnyEventoSchema.parse({
      tipoEvento: "ASIENTO_MANUAL",
      orgId: "00000000-0000-0000-0000-000000000001",
      referenciaId: "00000000-0000-0000-0000-000000000099",
      referenciaTabla: "manual",
      fecha: "2026-06-09",
      descripcion: "Asiento manual",
      idempotencyKey: "MANUAL_00000000-0000-0000-0000-000000000099",
      datos: {},
    });

    expect(result.tipoEvento).toBe("ASIENTO_MANUAL");
  });

  it("rechaza tipoEvento desconocido", () => {
    expect(() =>
      AnyEventoSchema.parse({ ...ventaBase, tipoEvento: "DEVOLUCION" })
    ).toThrow();
  });
});
