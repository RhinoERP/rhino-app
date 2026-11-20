export function buildApprovalWhatsAppMessage(params: {
  customerName: string;
  requestId: string;
  orgSlug: string;
  origin: string;
}) {
  const approvalUrl = new URL(
    `/org/${encodeURIComponent(params.orgSlug)}/solicitudes-venta/aprobacion#cotizacion-${encodeURIComponent(params.requestId)}`,
    params.origin
  );
  return `Hola, envié una cotización para ${params.customerName} (ref. ${params.requestId.slice(0, 8)}). Está pendiente de aprobación. Podés revisarla acá: ${approvalUrl.href}`;
}

export function buildApprovalWhatsAppUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function canShareApprovalRequest(status: string) {
  return status === "PENDING_APPROVAL";
}

export function canShareSyncedOfflineQuote(record: {
  status: string;
  requestId: string | null;
}) {
  return record.status === "synced" && record.requestId !== null;
}
