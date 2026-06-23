import { describe, expect, it } from "vitest";
import { resolveDirectSalePrintDispatch } from "./direct-sale-print-dispatch";

describe("resolveDirectSalePrintDispatch", () => {
  it("omits printing when shouldPrintTicket is false", () => {
    expect(
      resolveDirectSalePrintDispatch({
        shouldPrintTicket: false,
        arcaInvoice: {
          status: "authorized",
          invoiceNumber: "0001-00000001",
          cae: "123",
        },
      })
    ).toEqual({ kind: "none" });
  });

  it("dispatches fiscal invoice printing for authorized ARCA invoices", () => {
    expect(
      resolveDirectSalePrintDispatch({
        shouldPrintTicket: true,
        arcaInvoice: {
          status: "authorized",
          invoiceNumber: "0001-00000001",
          cae: "123",
        },
      })
    ).toEqual({ kind: "fiscal_invoice" });
  });

  it("dispatches internal ticket printing when invoicing was not requested", () => {
    expect(
      resolveDirectSalePrintDispatch({
        shouldPrintTicket: true,
        arcaInvoice: {
          status: "not_requested",
        },
      })
    ).toEqual({ kind: "internal_ticket" });
  });

  it("omits printing while fiscal invoicing is pending", () => {
    expect(
      resolveDirectSalePrintDispatch({
        shouldPrintTicket: true,
        arcaInvoice: {
          status: "pending_invoicing",
          error: "ARCA no disponible",
        },
      })
    ).toEqual({ kind: "none" });
  });
});
