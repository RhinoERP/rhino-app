import { describe, expect, it } from "vitest";
import { reviewMeliFiscalHistory } from "./accounting-fiscal-history";

const entry = {
  id: "00000000-0000-4000-8000-000000000001",
  org_id: "00000000-0000-4000-8000-000000000002",
  tipo_evento: "MELI_FACTURA",
  referencia_id: "00000000-0000-4000-8000-000000000003",
  referencia_tabla: "sales_orders",
  estado: "ACTIVO" as const,
  idempotency_key: "fiscal",
  anulado_por_id: null,
  fecha: "2026-11-23",
};

describe("revisión de historia fiscal Meli", () => {
  it("accepts an exact invoice or credit note receipt", () => {
    expect(reviewMeliFiscalHistory([entry], "invoice", entry.id)).toEqual([]);
    expect(
      reviewMeliFiscalHistory(
        [{ ...entry, tipo_evento: "MELI_NOTA_CREDITO" }],
        "creditNote",
        entry.id
      )
    ).toEqual([]);
  });
  it("reports missing receipts, unrelated entries, reversals and inactive entries", () => {
    expect(reviewMeliFiscalHistory([], "invoice", entry.id)).toHaveLength(1);
    expect(reviewMeliFiscalHistory([entry], "invoice", null)[0]).toContain(
      "sin recibo"
    );
    const reversal = {
      ...entry,
      id: "00000000-0000-4000-8000-000000000004",
      tipo_evento: "CONTRA_ASIENTO",
      referencia_id: entry.id,
      referencia_tabla: "accounting.journal_entries",
    };
    const issues = reviewMeliFiscalHistory(
      [{ ...entry, estado: "ANULADO" }, reversal],
      "creditNote",
      entry.id
    );
    expect(issues.join(" ")).toContain("no está vigente");
    expect(issues.join(" ")).toContain("Contra-asiento");
  });
});
