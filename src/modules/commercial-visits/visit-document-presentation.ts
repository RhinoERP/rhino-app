import type { VisitDocumentCandidates } from "./contracts";

const quoteStatusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_APPROVAL: "Pendiente de aprobación",
  RETURNED: "Devuelta para corrección",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CONVERTED: "Aprobada · Preventa creada",
  CANCELLED: "Dada de baja",
};

const preSaleStatusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  INCOMPLETE: "Incompleta",
  CONFIRMED: "Confirmada",
  DISPATCH: "Despachada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
};

export function visitDocumentStatusLabel(
  type: "quote" | "pre_sale",
  status: string
): string {
  const labels = type === "quote" ? quoteStatusLabels : preSaleStatusLabels;
  return labels[status] ?? status;
}

export function availableVisitDocuments(
  candidates: VisitDocumentCandidates | null,
  visitId: string,
  allowMove: boolean
): VisitDocumentCandidates {
  const selectable = (linkedVisitId: string | null) =>
    linkedVisitId === null || (allowMove && linkedVisitId !== visitId);
  return {
    quotes:
      candidates?.quotes.filter((quote) => selectable(quote.linkedVisitId)) ??
      [],
    orders:
      candidates?.orders.filter((order) => selectable(order.linkedVisitId)) ??
      [],
  };
}
