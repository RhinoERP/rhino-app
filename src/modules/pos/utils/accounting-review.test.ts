import { describe, expect, it } from "vitest";
import {
  resolvePosAccountingReviewSequence,
  restorePosAccountingReviewFlow,
  savePosAccountingReviewFlow,
} from "./accounting-review";

describe("resolvePosAccountingReviewSequence", () => {
  it("devuelve una única revisión para el asiento POS pendiente", () => {
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
    });

    expect(sequence).toEqual(["venta"]);
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
    };

    savePosAccountingReviewFlow(snapshot);
    expect(restorePosAccountingReviewFlow()).toEqual(snapshot);
  });
});
