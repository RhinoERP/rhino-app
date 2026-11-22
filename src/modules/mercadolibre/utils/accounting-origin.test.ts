import { describe, expect, it } from "vitest";
import { parseMeliJournalEntriesByOrigin } from "./accounting-origin";

const origin = {
  orgId: "00000000-0000-4000-8000-000000000001",
  referenciaId: "00000000-0000-4000-8000-000000000002",
  referenciaTabla: "mercadolibre_payments",
} as const;
const original = {
  id: "00000000-0000-4000-8000-000000000003",
  org_id: origin.orgId,
  tipo_evento: "MELI_COBRO",
  referencia_id: origin.referenciaId,
  referencia_tabla: origin.referenciaTabla,
  estado: "ACTIVO",
  idempotency_key: "meli:net",
  anulado_por_id: null,
  fecha: "2026-11-21",
};
const reversal = {
  ...original,
  id: "00000000-0000-4000-8000-000000000004",
  tipo_evento: "CONTRA_ASIENTO",
  referencia_id: original.id,
  referencia_tabla: "accounting.journal_entries",
  idempotency_key: "meli:net:reversal",
};

describe("Meli accounting origin reconciliation", () => {
  it("accepts multiple originals and associated reversals", () => {
    expect(
      parseMeliJournalEntriesByOrigin(origin, [
        original,
        { ...original, id: "00000000-0000-4000-8000-000000000005" },
        reversal,
      ])
    ).toHaveLength(3);
    expect(parseMeliJournalEntriesByOrigin(origin, [])).toEqual([]);
  });

  it("rejects foreign organizations, unrelated reversals and duplicate rows", () => {
    expect(() =>
      parseMeliJournalEntriesByOrigin(origin, [
        { ...original, org_id: "00000000-0000-4000-8000-000000000006" },
      ])
    ).toThrow("no corresponden");
    expect(() => parseMeliJournalEntriesByOrigin(origin, [reversal])).toThrow(
      "no corresponden"
    );
    expect(() =>
      parseMeliJournalEntriesByOrigin(origin, [original, original])
    ).toThrow("no corresponden");
  });

  it("rejects incomplete or malformed responses", () => {
    expect(() => parseMeliJournalEntriesByOrigin(origin, null)).toThrow();
    expect(() =>
      parseMeliJournalEntriesByOrigin(origin, [{ ...original, estado: "OTRO" }])
    ).toThrow();
  });
});
