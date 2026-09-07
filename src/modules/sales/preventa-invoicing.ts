type PreSaleStatus = "DRAFT" | string | null | undefined;
type ArcaStatus = "authorized" | string | null | undefined;

export function canIssueArcaInvoiceForPreventa(
  status: PreSaleStatus,
  enabled: boolean
): boolean {
  return status === "DRAFT" && enabled;
}

export function isArcaInvoiceEligibleSaleStatus(
  status: PreSaleStatus,
  allowPreventaInvoicing: boolean
): boolean {
  return (
    status === "CONFIRMED" ||
    status === "DISPATCH" ||
    status === "DELIVERED" ||
    canIssueArcaInvoiceForPreventa(status, allowPreventaInvoicing)
  );
}

export function isAuthorizedPreventaInvoice(
  status: PreSaleStatus,
  arcaStatus: ArcaStatus
): boolean {
  return status === "DRAFT" && arcaStatus === "authorized";
}

export function hasFullFiscalReversal(params: {
  saleTotal: number;
  authorizedCreditAmount: number;
}): boolean {
  return (
    Math.round(params.authorizedCreditAmount * 100) >=
    Math.round(params.saleTotal * 100)
  );
}
