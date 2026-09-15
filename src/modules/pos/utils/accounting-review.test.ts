import { describe, expect, it } from "vitest";
import {
  resolvePosAccountingReviewSequence,
  restorePosAccountingReviewFlow,
  savePosAccountingReviewFlow,
} from "./accounting-review";

describe("resolvePosAccountingReviewSequence", () => {
  it("prioriza la revisión de la venta antes del cobro cuando ambos pasos quedan pendientes", () => {
    const sequence = resolvePosAccountingReviewSequence({
      accountingStatus: "REVIEW_REQUIRED",
      accountingSalePayload: {
        tipoEvento: "VENTA_POS",
        referenciaId: "sale-1",
        referenciaTabla: "pos_sales",
        orgId: "org-1",
        fecha: "2026-09-15",
        descripcion: "Venta POS",
        idempotencyKey: "sale-key",
        datos: {
          totalVenta: "1000",
          clienteId: "cust-1",
          comprobanteNumero: "0001",
        },
      },
      accountingPaymentPayload: {
        tipoEvento: "COBRO_POS",
        referenciaId: "payment-1",
        referenciaTabla: "pos_payments",
        orgId: "org-1",
        fecha: "2026-09-15",
        descripcion: "Cobro POS",
        idempotencyKey: "payment-key",
        datos: {
          montoCobrado: "1000",
          metodoPago: "EFECTIVO",
          clienteId: "cust-1",
        },
      },
    });

    expect(sequence).toEqual(["venta", "cobro"]);
  });

  it("devuelve la secuencia del paso que quedó pendiente cuando sólo falta la venta", () => {
    expect(
      resolvePosAccountingReviewSequence({
        accountingStatus: "REVIEW_REQUIRED",
        accountingSalePayload: {
          tipoEvento: "VENTA_POS",
          referenciaId: "sale-1",
          referenciaTabla: "pos_sales",
          orgId: "org-1",
          fecha: "2026-09-15",
          descripcion: "Venta POS",
          idempotencyKey: "sale-key",
          datos: {
            totalVenta: "1000",
            clienteId: "cust-1",
            comprobanteNumero: "0001",
          },
        },
      })
    ).toEqual(["venta"]);
  });

  it("devuelve una secuencia vacía cuando la venta no necesita revisión manual", () => {
    expect(
      resolvePosAccountingReviewSequence({
        accountingStatus: "PENDING",
      })
    ).toEqual([]);
  });
});

describe("Pos accounting review persistence", () => {
  it("serializa y restaura el flujo pendiente para recuperar la revisión tras una recarga", () => {
    const snapshot = {
      salePayload: {
        tipoEvento: "VENTA_POS",
        referenciaId: "sale-1",
        referenciaTabla: "pos_sales",
        orgId: "org-1",
        fecha: "2026-09-15",
        descripcion: "Venta POS",
        idempotencyKey: "sale-key",
        datos: {
          totalVenta: "1000",
          clienteId: "cust-1",
          comprobanteNumero: "0001",
        },
      },
      paymentPayload: {
        tipoEvento: "COBRO_POS",
        referenciaId: "payment-1",
        referenciaTabla: "pos_payments",
        orgId: "org-1",
        fecha: "2026-09-15",
        descripcion: "Cobro POS",
        idempotencyKey: "payment-key",
        datos: {
          montoCobrado: "1000",
          metodoPago: "EFECTIVO",
          clienteId: "cust-1",
        },
      },
      steps: ["venta", "cobro"] as const,
      currentStepIndex: 1,
    };

    savePosAccountingReviewFlow(snapshot);
    expect(restorePosAccountingReviewFlow()).toEqual(snapshot);
  });
});
