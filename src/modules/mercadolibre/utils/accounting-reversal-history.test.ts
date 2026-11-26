import { describe, expect, it } from "vitest";
import { reviewMeliReversalHistory } from "./accounting-reversal-history";

const original = {
  id: "00000000-0000-4000-8000-000000000001",
  org_id: "00000000-0000-4000-8000-000000000002",
  tipo_evento: "MELI_COBRO",
  referencia_id: "00000000-0000-4000-8000-000000000003",
  referencia_tabla: "mercadolibre_payments",
  estado: "ACTIVO" as const,
  idempotency_key: "original",
  anulado_por_id: null,
  fecha: "2026-11-23",
};
const reversal = {
  ...original,
  id: "00000000-0000-4000-8000-000000000004",
  tipo_evento: "CONTRA_ASIENTO",
  referencia_id: original.id,
  referencia_tabla: "accounting.journal_entries",
};
const component = {
  key: "net",
  originalEntryId: original.id,
  reversalEntryId: reversal.id,
};

describe("reversal history review", () => {
  it("accepts only matched originals and verified reversals", () => {
    expect(
      reviewMeliReversalHistory([original, reversal], [component])
    ).toEqual([]);
    expect(
      reviewMeliReversalHistory(
        [original],
        [{ ...component, reversalEntryId: null }]
      )
    ).toEqual([]);
  });
  it("reports missing, unexpected, inactive and mislinked entries", () => {
    expect(reviewMeliReversalHistory([], [component])).toHaveLength(2);
    const external = {
      ...original,
      id: "00000000-0000-4000-8000-000000000005",
    };
    const issues = reviewMeliReversalHistory(
      [
        original,
        external,
        { ...reversal, referencia_id: external.id, estado: "ANULADO" },
      ],
      [component]
    );
    expect(issues.join(" ")).toContain("Asiento");
    expect(issues.join(" ")).toContain("Contra-asiento");
    expect(issues.join(" ")).toContain("no aparece");
  });
  it("rejects duplicated bindings and unexpected reversals", () => {
    const extra = { ...reversal, id: "00000000-0000-4000-8000-000000000006" };
    const issues = reviewMeliReversalHistory(
      [original, reversal, extra],
      [component, component]
    );
    expect(issues.join(" ")).toContain("más de una vez");
    expect(issues.join(" ")).toContain("inesperado");
  });
});
