import type { CreateDirectSaleResult } from "../types";

export type DirectSalePrintDispatchKind =
  | "none"
  | "fiscal_invoice"
  | "internal_ticket";

export type DirectSalePrintDispatch = {
  kind: DirectSalePrintDispatchKind;
};

type ResolveDirectSalePrintDispatchInput = {
  shouldPrintTicket: boolean;
  arcaInvoice?: CreateDirectSaleResult["arcaInvoice"];
};

export function resolveDirectSalePrintDispatch({
  shouldPrintTicket,
  arcaInvoice,
}: ResolveDirectSalePrintDispatchInput): DirectSalePrintDispatch {
  if (!shouldPrintTicket) {
    return { kind: "none" };
  }

  if (arcaInvoice?.status === "pending_invoicing") {
    return { kind: "none" };
  }

  if (arcaInvoice?.status === "authorized") {
    return { kind: "fiscal_invoice" };
  }

  return { kind: "internal_ticket" };
}
