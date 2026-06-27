import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewResponse } from "../rules.types";

// ------------------------------------------------------------
// Mock del módulo de queries para no necesitar DB en tests
// ------------------------------------------------------------
vi.mock("../rules.queries", () => ({
  loadRulesWithLines: vi.fn(),
}));

vi.mock("../../accounts/accounts.queries", () => ({
  resolveAccountFull: vi.fn(),
}));

import { resolveAccountFull } from "../../accounts/accounts.queries";
import { resolveEvent } from "../rules.engine";
import { loadRulesWithLines } from "../rules.queries";

const mockLoadRules = vi.mocked(loadRulesWithLines);
const mockResolveAccount = vi.mocked(resolveAccountFull);

// UUID fijos para tests
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const RULE_ID = "00000000-0000-0000-0000-000000000002";
const ACCT_DEUDORES = "aaa00000-0000-0000-0000-000000000001";
const ACCT_VENTAS = "aaa00000-0000-0000-0000-000000000002";
const ACCT_IVA_DEBITO = "aaa00000-0000-0000-0000-000000000003";
const ACCT_ANTICIPO_CLIENTES = "aaa00000-0000-0000-0000-000000000004";
const ACCT_AP_PROVEEDORES = "aaa00000-0000-0000-0000-000000000005";
const ACCT_IVA_CREDITO = "aaa00000-0000-0000-0000-000000000006";
const ACCT_PERCEPCIONES_IIBB = "aaa00000-0000-0000-0000-000000000007";
const ACCT_OTROS_INGRESOS = "aaa00000-0000-0000-0000-000000000008";

function mockAccount(id: string, codigo: string) {
  return { id, codigo, nombre: codigo };
}

const BASE_EVENT = {
  orgId: ORG_ID,
  referenciaId: "00000000-0000-0000-0000-000000000099",
  referenciaTabla: "sales_orders" as const,
  fecha: "2026-06-10",
  descripcion: "Factura de venta test",
  idempotencyKey: "TEST-001",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------
describe("resolveEvent — sin reglas configuradas", () => {
  it("lanza AppError 422 cuando no hay reglas configuradas", async () => {
    mockLoadRules.mockResolvedValue([]);

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000001",
      },
    };

    await expect(resolveEvent(event)).rejects.toThrow(
      "No hay reglas contables configuradas"
    );
  });
});

// ------------------------------------------------------------
describe("resolveEvent — FACTURA_VENTA MANUAL (fórmulas simples)", () => {
  it("retorna COMPLETO con líneas resueltas cuando todas las cuentas existen", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: { tipoFactura: "MANUAL" },
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 10,
        lines: [
          {
            id: "l1",
            rule_id: RULE_ID,
            account_code: "AR_DEUDORES_VENTAS",
            lado: "HABER",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "l2",
            rule_id: RULE_ID,
            account_code: "VENTAS_CALZADO",
            lado: "DEBE",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);

    mockResolveAccount.mockImplementation((code) => {
      if (code === "AR_DEUDORES_VENTAS") {
        return Promise.resolve(
          mockAccount(ACCT_DEUDORES, "AR_DEUDORES_VENTAS")
        );
      }
      if (code === "VENTAS_CALZADO") {
        return Promise.resolve(mockAccount(ACCT_VENTAS, "VENTAS_CALZADO"));
      }
      return Promise.resolve(null);
    });

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000001",
      },
    };

    const result: PreviewResponse = await resolveEvent(event);

    expect(result.estadoImputacion).toBe("COMPLETO");
    expect(result.lineas).toHaveLength(2);
    expect(result.debeTotal).toBe("1210.0000");
    expect(result.haberTotal).toBe("1210.0000");
    const haber = result.lineas.find((l) => l.lado === "HABER");
    expect(haber?.cuentaId).toBe(ACCT_DEUDORES);
  });

  it("retorna SUSPENSO cuando una cuenta no se encuentra en el plan", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "l1",
            rule_id: RULE_ID,
            account_code: "CUENTA_INEXISTENTE",
            lado: "DEBE",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockResolveAccount.mockResolvedValue(null); // cuenta no encontrada

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "500.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001",
      },
    };

    await expect(resolveEvent(event)).rejects.toThrow("Cuenta no encontrada");
  });
});

// ------------------------------------------------------------
describe("resolveEvent — condición prioridad (catch-all vs específica)", () => {
  it("aplica la regla de mayor prioridad que cumple la condición", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: "r-specific",
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: { tipoFactura: "ANTICIPO" },
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 20,
        lines: [
          {
            id: "ls1",
            rule_id: "r-specific",
            account_code: "ANTICIPO_CLIENTES",
            lado: "DEBE",
            formula: "datos.montoNeto",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
      {
        id: "r-catchall",
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "lc1",
            rule_id: "r-catchall",
            account_code: "VENTAS_CALZADO",
            lado: "DEBE",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);

    // MANUAL → no aplica regla ANTICIPO → aplica catch-all
    mockResolveAccount.mockResolvedValue(
      mockAccount(ACCT_VENTAS, "VENTAS_CALZADO")
    );

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "1000.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001",
      },
    };

    const result = await resolveEvent(event);
    expect(result.lineas[0].cuentaCodigo).toBe("VENTAS_CALZADO");
  });
});

// ------------------------------------------------------------
describe("resolveEvent — EXPAND:datos.lineasDesglosadas", () => {
  it("genera líneas neta + IVA por cada item desglosado", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: { tipoFactura: "MANUAL" },
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 10,
        lines: [
          {
            id: "lexp",
            rule_id: RULE_ID,
            account_code: null,
            lado: "HABER",
            formula: "EXPAND:datos.lineasDesglosadas",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "ldebe",
            rule_id: RULE_ID,
            account_code: "AR_DEUDORES_VENTAS",
            lado: "DEBE",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);

    mockResolveAccount.mockImplementation((code) => {
      if (code === "VENTAS_CALZADO") {
        return Promise.resolve(mockAccount(ACCT_VENTAS, "VENTAS_CALZADO"));
      }
      if (code === "IVA_DEBITO_FISCAL") {
        return Promise.resolve(
          mockAccount(ACCT_IVA_DEBITO, "IVA_DEBITO_FISCAL")
        );
      }
      if (code === "AR_DEUDORES_VENTAS") {
        return Promise.resolve(
          mockAccount(ACCT_DEUDORES, "AR_DEUDORES_VENTAS")
        );
      }
      return Promise.resolve(null);
    });

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000001",
        lineasDesglosadas: [
          {
            accountCode: "VENTAS_CALZADO",
            montoNeto: "1000.0000",
            montoImpuestos: "210.0000",
          },
        ],
      },
    };

    const result = await resolveEvent(event);

    // 2 del EXPAND (neta + IVA) + 1 del DEBE AR_DEUDORES
    expect(result.lineas).toHaveLength(3);
    const netaLine = result.lineas.find((l) => l.cuentaId === ACCT_VENTAS);
    expect(netaLine?.monto).toBe("1000.0000");
    const ivaLine = result.lineas.find((l) => l.cuentaId === ACCT_IVA_DEBITO);
    expect(ivaLine?.monto).toBe("210.0000");
  });

  it("genera líneas impositivas separadas para IVA, IIBB y otros tributos", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: { tipoFactura: "MANUAL" },
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 10,
        lines: [
          {
            id: "lexp",
            rule_id: RULE_ID,
            account_code: null,
            lado: "HABER",
            formula: "EXPAND:datos.lineasDesglosadas",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "ldebe",
            rule_id: RULE_ID,
            account_code: "AR_DEUDORES_VENTAS",
            lado: "DEBE",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);

    mockResolveAccount.mockImplementation((code) => {
      if (code === "VENTAS_CALZADO") {
        return Promise.resolve(mockAccount(ACCT_VENTAS, "VENTAS_CALZADO"));
      }
      if (code === "IVA_DEBITO_FISCAL") {
        return Promise.resolve(
          mockAccount(ACCT_IVA_DEBITO, "IVA_DEBITO_FISCAL")
        );
      }
      if (code === "PERCEPCIONES_IIBB") {
        return Promise.resolve(
          mockAccount(ACCT_PERCEPCIONES_IIBB, "PERCEPCIONES_IIBB")
        );
      }
      if (code === "OTROS_INGRESOS") {
        return Promise.resolve(
          mockAccount(ACCT_OTROS_INGRESOS, "OTROS_INGRESOS")
        );
      }
      if (code === "AR_DEUDORES_VENTAS") {
        return Promise.resolve(
          mockAccount(ACCT_DEUDORES, "AR_DEUDORES_VENTAS")
        );
      }
      return Promise.resolve(null);
    });

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "1235.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000001",
        lineasDesglosadas: [
          {
            accountCode: "VENTAS_CALZADO",
            montoNeto: "1000.0000",
            montoImpuestos: "235.0000",
            impuestos: [
              { monto: "210.0000", taxCode: "IVA_21", nombre: "IVA 21" },
              { monto: "20.0000", taxCode: "TRIBUTO_02", nombre: "IIBB" },
              {
                monto: "5.0000",
                taxCode: "TRIBUTO_99",
                nombre: "Otros tributos",
              },
            ],
          },
        ],
      },
    };

    const result = await resolveEvent(event);

    expect(result.lineas).toHaveLength(5);
    expect(
      result.lineas.find((l) => l.cuentaId === ACCT_IVA_DEBITO)?.monto
    ).toBe("210.0000");
    expect(
      result.lineas.find((l) => l.cuentaId === ACCT_PERCEPCIONES_IIBB)?.monto
    ).toBe("20.0000");
    expect(
      result.lineas.find((l) => l.cuentaId === ACCT_OTROS_INGRESOS)?.monto
    ).toBe("5.0000");
  });

  it("omite la línea de impuesto si montoImpuestos es 0 o ausente", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "lexp",
            rule_id: RULE_ID,
            account_code: null,
            lado: "HABER",
            formula: "EXPAND:datos.lineasDesglosadas",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockResolveAccount.mockResolvedValue(
      mockAccount(ACCT_VENTAS, "VENTAS_CALZADO")
    );

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "500.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001",
        lineasDesglosadas: [
          { accountCode: "VENTAS_CALZADO", montoNeto: "500.0000" }, // sin montoImpuestos
        ],
      },
    };

    const result = await resolveEvent(event);
    expect(result.lineas).toHaveLength(1); // solo la neta
  });
});

// ------------------------------------------------------------
describe("resolveEvent — línea seleccionable", () => {
  it("línea seleccionable tiene cuentaId null y opcionesCuenta pobladas", async () => {
    const opciones = [
      { accountCode: "CAJA_PESOS", label: "Caja Pesos" },
      { accountCode: "BANCO_BBVA_PESOS", label: "Banco BBVA" },
    ];

    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "COBRO",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "ls",
            rule_id: RULE_ID,
            account_code: null,
            lado: "DEBE",
            formula: "datos.montoCobrado",
            es_seleccionable: true,
            opciones_cuenta: opciones,
          },
          {
            id: "lh",
            rule_id: RULE_ID,
            account_code: "AR_DEUDORES_VENTAS",
            lado: "HABER",
            formula: "datos.montoCobrado",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockResolveAccount.mockResolvedValue(
      mockAccount(ACCT_DEUDORES, "AR_DEUDORES_VENTAS")
    );

    const event = {
      ...BASE_EVENT,
      tipoEvento: "COBRO" as const,
      referenciaTabla: "receivable_payments" as const,
      datos: {
        montoCobrado: "500.0000",
        metodoPago: "TRANSFERENCIA" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
      },
    };

    const result = await resolveEvent(event);
    const selLine = result.lineas.find((l) => l.esSeleccionable);
    expect(selLine).toBeDefined();
    expect(selLine?.cuentaId).toBeNull();
    expect(selLine?.pendienteImputacion).toBe(false); // seleccionable ≠ suspenso
    expect(selLine?.opcionesCuenta).toEqual(opciones);
    expect(result.estadoImputacion).toBe("SUSPENSO");
  });

  it("resuelve ORDEN_PAGO con cuenta bancaria seleccionable", async () => {
    const opciones = [
      { accountCode: "CAJA_PESOS", label: "Caja Pesos" },
      { accountCode: "BANCO_BBVA_PESOS", label: "Banco BBVA" },
    ];

    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "ORDEN_PAGO",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "ld",
            rule_id: RULE_ID,
            account_code: "AP_PROVEEDORES",
            lado: "DEBE",
            formula: "datos.monto",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "lh",
            rule_id: RULE_ID,
            account_code: null,
            lado: "HABER",
            formula: "datos.monto",
            es_seleccionable: true,
            opciones_cuenta: opciones,
          },
        ],
      },
    ]);
    mockResolveAccount.mockResolvedValue(
      mockAccount(ACCT_AP_PROVEEDORES, "AP_PROVEEDORES")
    );

    const event = {
      ...BASE_EVENT,
      tipoEvento: "ORDEN_PAGO" as const,
      referenciaTabla: "payable_payments" as const,
      datos: {
        monto: "2500.0000",
        metodoPago: "TRANSFERENCIA" as const,
        proveedorId: "00000000-0000-0000-0000-000000000020",
      },
    };

    const result = await resolveEvent(event);
    const bankLine = result.lineas.find((line) => line.esSeleccionable);

    expect(result.estadoImputacion).toBe("SUSPENSO");
    expect(result.debeTotal).toBe("2500.0000");
    expect(result.haberTotal).toBe("2500.0000");
    expect(bankLine?.lado).toBe("HABER");
    expect(bankLine?.cuentaId).toBeNull();
    expect(bankLine?.opcionesCuenta).toEqual(opciones);
  });
});

// ------------------------------------------------------------
describe("resolveEvent — NC_COMPRA", () => {
  it("retorna el asiento inverso de FACTURA_COMPRA con cuenta neta seleccionable", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "NC_COMPRA",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "l1",
            rule_id: RULE_ID,
            account_code: "AP_PROVEEDORES",
            lado: "DEBE",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "l2",
            rule_id: RULE_ID,
            account_code: "IVA_CREDITO_FISCAL",
            lado: "HABER",
            formula: "datos.montoImpuestos",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "l3",
            rule_id: RULE_ID,
            account_code: "PERCEPCIONES_IIBB",
            lado: "HABER",
            formula: "datos.montoIIBB",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "l4",
            rule_id: RULE_ID,
            account_code: null,
            lado: "HABER",
            formula: "datos.montoNeto",
            es_seleccionable: true,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockResolveAccount.mockImplementation((code) => {
      if (code === "AP_PROVEEDORES") {
        return Promise.resolve(
          mockAccount(ACCT_AP_PROVEEDORES, "AP_PROVEEDORES")
        );
      }
      if (code === "IVA_CREDITO_FISCAL") {
        return Promise.resolve(
          mockAccount(ACCT_IVA_CREDITO, "IVA_CREDITO_FISCAL")
        );
      }
      if (code === "PERCEPCIONES_IIBB") {
        return Promise.resolve(
          mockAccount(ACCT_PERCEPCIONES_IIBB, "PERCEPCIONES_IIBB")
        );
      }
      return Promise.resolve(null);
    });

    const event = {
      ...BASE_EVENT,
      tipoEvento: "NC_COMPRA" as const,
      referenciaTabla: "purchase_orders" as const,
      datos: {
        montoNeto: "1000.0000",
        montoImpuestos: "210.0000",
        montoIIBB: "30.0000",
        totalFactura: "1240.0000",
        proveedorId: "00000000-0000-0000-0000-000000000020",
        facturaNumero: "NC-B-0001-00000001",
      },
    };

    const result = await resolveEvent(event);
    const netLine = result.lineas.find(
      (line) => line.esSeleccionable && line.lado === "HABER"
    );

    expect(result.estadoImputacion).toBe("SUSPENSO");
    expect(result.debeTotal).toBe("1240.0000");
    expect(result.haberTotal).toBe("1240.0000");
    expect(netLine?.monto).toBe("1000.0000");
    expect(netLine?.cuentaId).toBeNull();
  });
});

// ------------------------------------------------------------
describe("resolveEvent — campos opcionales con valor 0 omitidos", () => {
  it("omite líneas cuya fórmula evalúa a 0 (campo ausente)", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: RULE_ID,
        org_id: ORG_ID,
        tipo_evento: "FACTURA_COMPRA",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "l1",
            rule_id: RULE_ID,
            account_code: "IVA_CREDITO_FISCAL",
            lado: "DEBE",
            formula: "datos.montoImpuestos",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "l2",
            rule_id: RULE_ID,
            account_code: "PERCEPCIONES_IIBB",
            lado: "DEBE",
            formula: "datos.montoIIBB", // ausente en el payload
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "l3",
            rule_id: RULE_ID,
            account_code: "AP_PROVEEDORES",
            lado: "HABER",
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockResolveAccount.mockResolvedValue(
      mockAccount("some-uuid", "CUENTA_TEST")
    );

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_COMPRA" as const,
      referenciaTabla: "purchase_orders" as const,
      datos: {
        montoNeto: "800.0000",
        montoImpuestos: "168.0000",
        totalFactura: "968.0000",
        condicionCompra: "CONTADO" as const,
        proveedorId: "00000000-0000-0000-0000-000000000020",
        facturaNumero: "B-0001-00000001",
        // montoIIBB ausente
      },
    };

    const result = await resolveEvent(event);
    // l2 (montoIIBB) debe ser omitida
    expect(result.lineas).toHaveLength(2);
  });
});

// ============================================================
// Flujo: FACTURA_VENTA ANTICIPO → NC_VENTA ANTICIPO → FACTURA_VENTA REMITO
//
// Escenario: venta total $1210 (neto $1000 + IVA $210)
//   Paso 1 — Factura anticipo 50%: $605 (neto $500 + IVA $105)
//   Paso 2 — NC revierte el anticipo: mismos montos, lados invertidos
//   Paso 3 — Factura remito 100%: $1210 con lineasDesglosadas
// ============================================================

const REGLA_ANTICIPO_FACTURA = {
  id: "r-anticipo",
  org_id: ORG_ID,
  tipo_evento: "FACTURA_VENTA",
  condicion: { tipoFactura: "ANTICIPO" },
  activa: true,
  es_fija: true,
  descripcion: null,
  prioridad: 20,
  lines: [
    {
      id: "la1",
      rule_id: "r-anticipo",
      account_code: "ANTICIPO_CLIENTES",
      lado: "DEBE" as const,
      formula: "datos.montoNeto",
      es_seleccionable: false,
      opciones_cuenta: null,
    },
    {
      id: "la2",
      rule_id: "r-anticipo",
      account_code: "IVA_DEBITO_FISCAL",
      lado: "DEBE" as const,
      formula: "datos.montoImpuestos",
      es_seleccionable: false,
      opciones_cuenta: null,
    },
    {
      id: "la3",
      rule_id: "r-anticipo",
      account_code: "AR_DEUDORES_VENTAS",
      lado: "HABER" as const,
      formula: "datos.totalFactura",
      es_seleccionable: false,
      opciones_cuenta: null,
    },
  ],
};

const REGLA_NC_ANTICIPO = {
  id: "r-nc-anticipo",
  org_id: ORG_ID,
  tipo_evento: "NC_VENTA",
  condicion: { tipoFactura: "ANTICIPO" },
  activa: true,
  es_fija: true,
  descripcion: null,
  prioridad: 20,
  lines: [
    {
      id: "ln1",
      rule_id: "r-nc-anticipo",
      account_code: "AR_DEUDORES_VENTAS",
      lado: "DEBE" as const,
      formula: "datos.totalFactura",
      es_seleccionable: false,
      opciones_cuenta: null,
    },
    {
      id: "ln2",
      rule_id: "r-nc-anticipo",
      account_code: "ANTICIPO_CLIENTES",
      lado: "HABER" as const,
      formula: "datos.montoNeto",
      es_seleccionable: false,
      opciones_cuenta: null,
    },
    {
      id: "ln3",
      rule_id: "r-nc-anticipo",
      account_code: "IVA_DEBITO_FISCAL",
      lado: "HABER" as const,
      formula: "datos.montoImpuestos",
      es_seleccionable: false,
      opciones_cuenta: null,
    },
  ],
};

function mockAnticipoCuentas() {
  mockResolveAccount.mockImplementation((code) => {
    if (code === "ANTICIPO_CLIENTES") {
      return Promise.resolve(
        mockAccount(ACCT_ANTICIPO_CLIENTES, "ANTICIPO_CLIENTES")
      );
    }
    if (code === "IVA_DEBITO_FISCAL") {
      return Promise.resolve(mockAccount(ACCT_IVA_DEBITO, "IVA_DEBITO_FISCAL"));
    }
    if (code === "AR_DEUDORES_VENTAS") {
      return Promise.resolve(mockAccount(ACCT_DEUDORES, "AR_DEUDORES_VENTAS"));
    }
    if (code === "VENTAS_CALZADO") {
      return Promise.resolve(mockAccount(ACCT_VENTAS, "VENTAS_CALZADO"));
    }
    return Promise.resolve(null);
  });
}

// ------------------------------------------------------------
describe("resolveEvent — FACTURA_VENTA ANTICIPO (50% del total)", () => {
  it("genera 3 líneas: DEBE ANTICIPO_CLIENTES + IVA_DEBITO, HABER AR_DEUDORES", async () => {
    mockLoadRules.mockResolvedValue([REGLA_ANTICIPO_FACTURA]);
    mockAnticipoCuentas();

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "ANTICIPO" as const,
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000001",
      },
    };

    const result = await resolveEvent(event);

    expect(result.estadoImputacion).toBe("COMPLETO");
    expect(result.lineas).toHaveLength(3);
    expect(result.debeTotal).toBe("605.0000");
    expect(result.haberTotal).toBe("605.0000");

    const debeAnticipo = result.lineas.find(
      (l) => l.lado === "DEBE" && l.cuentaId === ACCT_ANTICIPO_CLIENTES
    );
    expect(debeAnticipo?.monto).toBe("500.0000");

    const debeIva = result.lineas.find(
      (l) => l.lado === "DEBE" && l.cuentaId === ACCT_IVA_DEBITO
    );
    expect(debeIva?.monto).toBe("105.0000");

    const haberDeudores = result.lineas.find(
      (l) => l.lado === "HABER" && l.cuentaId === ACCT_DEUDORES
    );
    expect(haberDeudores?.monto).toBe("605.0000");
  });

  it("el asiento está balanceado (debeTotal === haberTotal)", async () => {
    mockLoadRules.mockResolvedValue([REGLA_ANTICIPO_FACTURA]);
    mockAnticipoCuentas();

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "ANTICIPO" as const,
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        condicionVenta: "CREDITO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000002",
      },
    };

    const result = await resolveEvent(event);
    expect(result.debeTotal).toBe(result.haberTotal);
  });

  it("NO aplica la regla ANTICIPO a una factura MANUAL (condición no coincide)", async () => {
    mockLoadRules.mockResolvedValue([
      REGLA_ANTICIPO_FACTURA,
      {
        id: "r-catchall",
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: null,
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 0,
        lines: [
          {
            id: "lc1",
            rule_id: "r-catchall",
            account_code: "AR_DEUDORES_VENTAS",
            lado: "HABER" as const,
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockAnticipoCuentas();

    const event = {
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      datos: {
        tipoFactura: "MANUAL" as const,
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0002-00000001",
      },
    };

    const result = await resolveEvent(event);
    expect(result.lineas).toHaveLength(1);
    expect(result.lineas[0].cuentaCodigo).toBe("AR_DEUDORES_VENTAS");
  });
});

// ------------------------------------------------------------
describe("resolveEvent — NC_VENTA ANTICIPO (revierte el adelanto)", () => {
  it("genera 3 líneas: DEBE AR_DEUDORES, HABER ANTICIPO_CLIENTES + IVA_DEBITO", async () => {
    mockLoadRules.mockResolvedValue([REGLA_NC_ANTICIPO]);
    mockAnticipoCuentas();

    const event = {
      ...BASE_EVENT,
      tipoEvento: "NC_VENTA" as const,
      referenciaTabla: "credit_notes" as const,
      idempotencyKey: "NC-ANTICIPO-001",
      datos: {
        tipoFactura: "ANTICIPO" as const,
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        clienteId: "00000000-0000-0000-0000-000000000010",
        ventaId: BASE_EVENT.referenciaId,
      },
    };

    const result = await resolveEvent(event);

    expect(result.estadoImputacion).toBe("COMPLETO");
    expect(result.lineas).toHaveLength(3);
    expect(result.debeTotal).toBe("605.0000");
    expect(result.haberTotal).toBe("605.0000");

    const debeDeudores = result.lineas.find(
      (l) => l.lado === "DEBE" && l.cuentaId === ACCT_DEUDORES
    );
    expect(debeDeudores?.monto).toBe("605.0000");

    const haberAnticipo = result.lineas.find(
      (l) => l.lado === "HABER" && l.cuentaId === ACCT_ANTICIPO_CLIENTES
    );
    expect(haberAnticipo?.monto).toBe("500.0000");

    const haberIva = result.lineas.find(
      (l) => l.lado === "HABER" && l.cuentaId === ACCT_IVA_DEBITO
    );
    expect(haberIva?.monto).toBe("105.0000");
  });
});

// ------------------------------------------------------------
describe("Flujo completo: ANTICIPO → NC_ANTICIPO → REMITO — simetría y balance", () => {
  it("NC_ANTICIPO es espejo exacto de FACTURA_ANTICIPO (DEBE ↔ HABER, mismos montos)", async () => {
    mockAnticipoCuentas();

    mockLoadRules.mockResolvedValue([REGLA_ANTICIPO_FACTURA]);
    const facturaResult = await resolveEvent({
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      idempotencyKey: "ANTICIPO-SIM-001",
      datos: {
        tipoFactura: "ANTICIPO" as const,
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000001",
      },
    });

    mockLoadRules.mockResolvedValue([REGLA_NC_ANTICIPO]);
    const ncResult = await resolveEvent({
      ...BASE_EVENT,
      tipoEvento: "NC_VENTA" as const,
      referenciaTabla: "credit_notes" as const,
      idempotencyKey: "NC-ANTICIPO-SIM-001",
      datos: {
        tipoFactura: "ANTICIPO" as const,
        totalFactura: "605.0000",
        montoNeto: "500.0000",
        montoImpuestos: "105.0000",
        clienteId: "00000000-0000-0000-0000-000000000010",
        ventaId: BASE_EVENT.referenciaId,
      },
    });

    // Cada cuenta de la factura debe aparecer en la NC con el lado opuesto y el mismo monto
    for (const facturaLine of facturaResult.lineas) {
      const ladoEsperado = facturaLine.lado === "DEBE" ? "HABER" : "DEBE";
      const ncLine = ncResult.lineas.find(
        (l) => l.cuentaId === facturaLine.cuentaId && l.lado === ladoEsperado
      );
      expect(
        ncLine,
        `Falta línea NC para cuentaId=${facturaLine.cuentaId} lado=${ladoEsperado}`
      ).toBeDefined();
      expect(ncLine?.monto).toBe(facturaLine.monto);
    }
  });

  it("FACTURA REMITO 100% genera asiento balanceado con lineasDesglosadas", async () => {
    mockLoadRules.mockResolvedValue([
      {
        id: "r-remito",
        org_id: ORG_ID,
        tipo_evento: "FACTURA_VENTA",
        condicion: { tipoFactura: "REMITO" },
        activa: true,
        es_fija: true,
        descripcion: null,
        prioridad: 15,
        lines: [
          {
            id: "lr1",
            rule_id: "r-remito",
            account_code: null,
            lado: "HABER" as const,
            formula: "EXPAND:datos.lineasDesglosadas",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
          {
            id: "lr2",
            rule_id: "r-remito",
            account_code: "AR_DEUDORES_VENTAS",
            lado: "DEBE" as const,
            formula: "datos.totalFactura",
            es_seleccionable: false,
            opciones_cuenta: null,
          },
        ],
      },
    ]);
    mockAnticipoCuentas();

    const result = await resolveEvent({
      ...BASE_EVENT,
      tipoEvento: "FACTURA_VENTA" as const,
      idempotencyKey: "REMITO-001",
      datos: {
        tipoFactura: "REMITO" as const,
        totalFactura: "1210.0000",
        condicionVenta: "CONTADO" as const,
        clienteId: "00000000-0000-0000-0000-000000000010",
        facturaNumero: "A-0001-00000002",
        lineasDesglosadas: [
          {
            accountCode: "VENTAS_CALZADO",
            montoNeto: "1000.0000",
            montoImpuestos: "210.0000",
          },
        ],
      },
    });

    // EXPAND: 1 neta VENTAS_CALZADO + 1 IVA_DEBITO_FISCAL + 1 DEBE AR_DEUDORES
    expect(result.lineas).toHaveLength(3);
    expect(result.debeTotal).toBe("1210.0000");
    expect(result.haberTotal).toBe("1210.0000");
    expect(result.estadoImputacion).toBe("COMPLETO");

    const debeDeudores = result.lineas.find(
      (l) => l.lado === "DEBE" && l.cuentaId === ACCT_DEUDORES
    );
    expect(debeDeudores?.monto).toBe("1210.0000");

    const haberVentas = result.lineas.find((l) => l.cuentaId === ACCT_VENTAS);
    expect(haberVentas?.monto).toBe("1000.0000");
    expect(haberVentas?.lado).toBe("HABER");
  });
});
