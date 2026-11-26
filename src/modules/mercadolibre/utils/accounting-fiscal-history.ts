import type { parseMeliJournalEntriesByOrigin } from "./accounting-origin";

type Entry = ReturnType<typeof parseMeliJournalEntriesByOrigin>[number];

export function reviewMeliFiscalHistory(
  entries: Entry[],
  originType: "invoice" | "creditNote",
  receiptId: string | null
): string[] {
  const expectedType =
    originType === "invoice" ? "MELI_FACTURA" : "MELI_NOTA_CREDITO";
  const expectedId = receiptId?.toLowerCase();
  const issues: string[] = [];
  let found = false;
  for (const entry of entries) {
    if (entry.tipo_evento === "CONTRA_ASIENTO") {
      issues.push(`Contra-asiento ${entry.id} requiere revisión.`);
    } else if (entry.id.toLowerCase() !== expectedId) {
      issues.push(`Asiento ${entry.id} sin recibo fiscal identificado.`);
    } else {
      found = true;
      if (
        entry.tipo_evento !== expectedType ||
        entry.estado !== "ACTIVO" ||
        entry.anulado_por_id !== null
      ) {
        issues.push(
          `El asiento fiscal ${entry.id} no está vigente o no coincide.`
        );
      }
    }
  }
  if (expectedId && !found) {
    issues.push("El recibo fiscal no aparece en la historia del comprobante.");
  }
  return issues;
}
