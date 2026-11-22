import { z } from "zod";

const originTable = z.enum([
  "sales_orders",
  "credit_notes",
  "mercadolibre_payments",
]);

const journalEntry = z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  tipo_evento: z.string().nullable(),
  referencia_id: z.uuid(),
  referencia_tabla: z.string(),
  estado: z.enum(["ACTIVO", "ANULADO"]),
  idempotency_key: z.string().min(1),
  anulado_por_id: z.uuid().nullable(),
  fecha: z.string().min(1),
});

export type MeliJournalOrigin = {
  orgId: string;
  referenciaId: string;
  referenciaTabla: z.output<typeof originTable>;
};

export function parseMeliJournalEntriesByOrigin(
  origin: MeliJournalOrigin,
  input: unknown
) {
  const entries = z.array(journalEntry).parse(input);
  const sourceId = origin.referenciaId.toLowerCase();
  const orgId = origin.orgId.toLowerCase();
  const originalIds = new Set(
    entries
      .filter(
        (entry) =>
          entry.referencia_tabla === origin.referenciaTabla &&
          entry.referencia_id.toLowerCase() === sourceId
      )
      .map((entry) => entry.id.toLowerCase())
  );
  const seen = new Set<string>();

  for (const entry of entries) {
    const id = entry.id.toLowerCase();
    const isOriginal = originalIds.has(id);
    const isReversal =
      entry.tipo_evento === "CONTRA_ASIENTO" &&
      entry.referencia_tabla === "accounting.journal_entries" &&
      originalIds.has(entry.referencia_id.toLowerCase());
    if (
      entry.org_id.toLowerCase() !== orgId ||
      seen.has(id) ||
      !(isOriginal || isReversal)
    ) {
      throw new Error(
        "La consulta contable devolvió asientos que no corresponden al origen solicitado."
      );
    }
    seen.add(id);
  }
  return entries;
}
