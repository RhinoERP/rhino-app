import type { PosSaleAccountingStatus } from "../types";

export const POS_ACCOUNTING_INBOX_STATUSES = [
  "REVIEW_REQUIRED",
  "ERROR",
  "FORMALIZATION_ERROR",
  "PENDING",
] as const satisfies readonly PosSaleAccountingStatus[];

export type PosAccountingInboxStatus =
  (typeof POS_ACCOUNTING_INBOX_STATUSES)[number];

export type PosAccountingInboxAction =
  | "review"
  | "formalize"
  | "wait"
  | "unavailable";

export function isPosSaleAccountingActionable(
  status: string | null
): status is PosAccountingInboxStatus {
  return (POS_ACCOUNTING_INBOX_STATUSES as readonly string[]).includes(
    status ?? ""
  );
}

export function resolvePosAccountingInboxAction(item: {
  accountingStatus: PosAccountingInboxStatus;
  arcaStatus: string | null;
  hasEventSnapshot: boolean;
}): PosAccountingInboxAction {
  switch (item.accountingStatus) {
    case "REVIEW_REQUIRED":
    case "ERROR":
      return item.hasEventSnapshot ? "review" : "unavailable";
    case "FORMALIZATION_ERROR":
      return "formalize";
    default:
      // PENDING sólo se formaliza cuando ARCA autoriza la factura.
      return item.arcaStatus === "authorized" ? "formalize" : "wait";
  }
}
