import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoVentaPos } from "@/modules/accounting/types";

vi.mock("server-only", () => ({}));

const asentarInformalEntry = vi.fn();
const createInformalEntry = vi.fn();
const previewAccountingEvent = vi.fn();

vi.mock("@/lib/accounting-server", () => ({
  asentarInformalEntry: (...args: unknown[]) => asentarInformalEntry(...args),
  createInformalEntry: (...args: unknown[]) => createInformalEntry(...args),
  previewAccountingEvent: (...args: unknown[]) =>
    previewAccountingEvent(...args),
}));

const { resolvePosCobroDefaultAccountCode, runPosSaleAccountingFlow } =
  await import("./pos-sale-accounting.service");

const eventoVenta: EventoVentaPos = {
  tipoEvento: "VENTA_POS",
  referenciaId: "sale-1",
  referenciaTabla: "pos_sales",
  orgId: "org-1",
  fecha: "2026-09-17",
  descripcion: "Venta POS",
  idempotencyKey: "VENTA_POS_sale-1",
  datos: {
    totalVenta: "1000.0000",
    clienteId: "cust-1",
    comprobanteNumero: "0001",
    metodoPago: "EFECTIVO",
    bancoAccountCode: "CAJA_PESOS",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePosCobroDefaultAccountCode", () => {
  it("resuelve caja, medios electrónicos y valores a depositar", () => {
    expect(
      resolvePosCobroDefaultAccountCode({
        paymentMethod: "efectivo",
        cashAccountCode: "CAJA_PESOS",
        cardAccountCode: "TARJETAS",
        transferAccountCode: "BANCO_PESOS",
        electronicAccountCode: "BANCO_PESOS",
      })
    ).toBe("CAJA_PESOS");

    expect(
      resolvePosCobroDefaultAccountCode({
        paymentMethod: "transferencia",
        cashAccountCode: null,
        cardAccountCode: null,
        transferAccountCode: "BANCO_PESOS",
        electronicAccountCode: "BANCO_OTRO",
      })
    ).toBe("BANCO_PESOS");

    expect(
      resolvePosCobroDefaultAccountCode({
        paymentMethod: "cheque",
        cashAccountCode: null,
        cardAccountCode: null,
        transferAccountCode: null,
        electronicAccountCode: null,
      })
    ).toBe("VALORES_A_DEPOSITAR");
  });
});

describe("runPosSaleAccountingFlow", () => {
  it("crea un único informal para Factura B/C", async () => {
    previewAccountingEvent.mockResolvedValue({ estadoImputacion: "COMPLETO" });
    createInformalEntry.mockResolvedValue("informal-sale-1");

    const patch = await runPosSaleAccountingFlow({
      eventoVenta,
      isTicketX: false,
      automaticAccountingEnabled: true,
      orgId: "org-1",
    });

    expect(createInformalEntry).toHaveBeenCalledTimes(1);
    expect(createInformalEntry).toHaveBeenCalledWith(eventoVenta, "VENTA_POS");
    expect(patch).toMatchObject({
      accounting_status: "PENDING",
      accounting_sale_entry_id: "informal-sale-1",
      accounting_payment_entry_id: null,
    });
  });

  it("asienta un único informal para Ticket X", async () => {
    previewAccountingEvent.mockResolvedValue({ estadoImputacion: "COMPLETO" });
    createInformalEntry.mockResolvedValue("informal-sale-1");

    const patch = await runPosSaleAccountingFlow({
      eventoVenta,
      isTicketX: true,
      automaticAccountingEnabled: true,
      orgId: "org-1",
    });

    expect(asentarInformalEntry).toHaveBeenCalledTimes(1);
    expect(asentarInformalEntry).toHaveBeenCalledWith(
      "informal-sale-1",
      "org-1"
    );
    expect(patch.accounting_status).toBe("SETTLED_INFORMAL");
  });

  it("deja revisión cuando el preview de venta está incompleto", async () => {
    previewAccountingEvent.mockResolvedValue({ estadoImputacion: "SUSPENSO" });

    const patch = await runPosSaleAccountingFlow({
      eventoVenta,
      isTicketX: false,
      automaticAccountingEnabled: true,
      orgId: "org-1",
    });

    expect(createInformalEntry).not.toHaveBeenCalled();
    expect(patch.accounting_status).toBe("REVIEW_REQUIRED");
  });

  it("no llama al servicio cuando la contabilidad automática está apagada", async () => {
    const patch = await runPosSaleAccountingFlow({
      eventoVenta,
      isTicketX: false,
      automaticAccountingEnabled: false,
      orgId: "org-1",
    });

    expect(previewAccountingEvent).not.toHaveBeenCalled();
    expect(patch.accounting_status).toBe("REVIEW_REQUIRED");
  });

  it("reutiliza el asiento existente en un reintento", async () => {
    const patch = await runPosSaleAccountingFlow({
      eventoVenta,
      isTicketX: false,
      automaticAccountingEnabled: true,
      orgId: "org-1",
      existingSaleEntryId: "informal-sale-1",
    });

    expect(createInformalEntry).not.toHaveBeenCalled();
    expect(patch.accounting_sale_entry_id).toBe("informal-sale-1");
  });

  it("registra errores del servicio contable", async () => {
    previewAccountingEvent.mockRejectedValue(new Error("servicio caído"));

    const patch = await runPosSaleAccountingFlow({
      eventoVenta,
      isTicketX: false,
      automaticAccountingEnabled: true,
      orgId: "org-1",
    });

    expect(patch.accounting_status).toBe("ERROR");
    expect(patch.accounting_last_error).toBe("servicio caído");
  });
});
