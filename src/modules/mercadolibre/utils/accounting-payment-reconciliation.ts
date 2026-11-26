import type { listMeliPaymentJournalEntries } from "../service/meli-accounting-drafts.service";
import type { listMeliPaymentPreparations } from "../service/meli-payment-preparations.service";

type Entry = Awaited<ReturnType<typeof listMeliPaymentJournalEntries>>[number];
type Preparation = Awaited<
  ReturnType<typeof listMeliPaymentPreparations>
>[number];
type Issue = { key: string; message: string };

function reviewComponent(
  preparationId: string,
  component: Preparation["components"][number],
  entries: Entry[],
  publishedIds: Set<string>
): Issue[] {
  const key = `${preparationId}:${component.key}`;
  if (component.dispatchStatus === "UNCERTAIN") {
    return [
      {
        key: `${key}:uncertain`,
        message: `${component.description}: envío sin confirmar; requiere recuperación con la solicitud original.`,
      },
    ];
  }
  if (component.dispatchStatus !== "PUBLISHED" || !component.journalEntryId) {
    return [];
  }
  const id = component.journalEntryId.toLowerCase();
  const issues: Issue[] = [];
  if (publishedIds.has(id)) {
    issues.push({
      key: `${key}:duplicate`,
      message: `${component.description}: asiento vinculado más de una vez.`,
    });
  }
  publishedIds.add(id);
  const entry = entries.find((item) => item.id.toLowerCase() === id);
  if (!entry) {
    issues.push({
      key: `${key}:missing`,
      message: `${component.description}: el asiento informado no aparece en la historia del cobro.`,
    });
  } else if (entry.tipo_evento !== "MELI_COBRO" || entry.estado !== "ACTIVO") {
    issues.push({
      key: `${key}:inactive`,
      message: `${component.description}: el asiento informado no es un cobro Meli activo.`,
    });
  }
  if (
    entry &&
    (entry.anulado_por_id ||
      entries.some(
        (candidate) =>
          candidate.tipo_evento === "CONTRA_ASIENTO" &&
          candidate.referencia_tabla === "accounting.journal_entries" &&
          candidate.referencia_id?.toLowerCase() === id
      ))
  ) {
    issues.push({
      key: `${key}:reversal`,
      message: `${component.description}: el asiento tiene una reversión o un contra-asiento; requiere revisión.`,
    });
  }
  return issues;
}

export function reviewMeliPaymentDispatches(
  entries: Entry[],
  preparations: Preparation[]
) {
  const issues: Issue[] = [];
  const publishedIds = new Set<string>();

  for (const preparation of preparations) {
    for (const component of preparation.components) {
      issues.push(
        ...reviewComponent(preparation.id, component, entries, publishedIds)
      );
    }
  }

  for (const entry of entries) {
    if (
      entry.tipo_evento !== "CONTRA_ASIENTO" &&
      !publishedIds.has(entry.id.toLowerCase())
    ) {
      issues.push({
        key: `${entry.id}:unmatched`,
        message: `Asiento ${entry.id} sin envío publicado identificado: requiere revisión manual.`,
      });
    }
  }
  return issues;
}
