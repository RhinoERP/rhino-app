import { describe, expect, it } from "vitest";
import { reviewMeliPaymentDispatches } from "./accounting-payment-reconciliation";

const original = {
  id: "00000000-0000-4000-8000-000000000001",
  org_id: "00000000-0000-4000-8000-000000000002",
  tipo_evento: "MELI_COBRO",
  referencia_id: "00000000-0000-4000-8000-000000000003",
  referencia_tabla: "mercadolibre_payments",
  estado: "ACTIVO" as const,
  idempotency_key: "key",
  anulado_por_id: null,
  fecha: "2026-11-23",
};
const component = {
  key: "net",
  description: "Neto",
  amount: "100.00",
  dispatchStatus: "PUBLISHED" as const,
  journalEntryId: original.id,
};
const preparation = {
  id: "00000000-0000-4000-8000-000000000004",
  draft_id: "00000000-0000-4000-8000-000000000005",
  status: "PREPARED" as const,
  created_by: "00000000-0000-4000-8000-000000000006",
  created_at: "2026-11-23T12:00:00Z",
  cancelled_by: null,
  cancelled_at: null,
  components: [component],
};

describe("Meli payment dispatch review", () => {
  it("finds unresolved sends and published receipts missing from history", () => {
    const issues = reviewMeliPaymentDispatches(
      [],
      [
        {
          ...preparation,
          components: [
            component,
            {
              ...component,
              key: "commission",
              description: "Comisión",
              dispatchStatus: "UNCERTAIN",
              journalEntryId: null,
            },
          ],
        },
      ]
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      expect.stringContaining("no aparece"),
      expect.stringContaining("sin confirmar"),
    ]);
  });

  it("requires review for inactive, duplicated or unlinked originals", () => {
    const issues = reviewMeliPaymentDispatches(
      [
        { ...original, estado: "ANULADO" },
        { ...original, id: "00000000-0000-4000-8000-000000000007" },
      ],
      [
        {
          ...preparation,
          components: [component, { ...component, key: "discount" }],
        },
      ]
    );
    expect(issues.map((issue) => issue.message).join(" ")).toContain(
      "no es un cobro Meli activo"
    );
    expect(issues.map((issue) => issue.message).join(" ")).toContain(
      "vinculado más de una vez"
    );
    expect(issues.map((issue) => issue.message).join(" ")).toContain(
      "sin envío publicado"
    );
  });

  it("flags a published entry with a contra-entry even when both remain active", () => {
    expect(
      reviewMeliPaymentDispatches(
        [
          original,
          {
            ...original,
            id: "00000000-0000-4000-8000-000000000008",
            tipo_evento: "CONTRA_ASIENTO",
            referencia_id: original.id,
            referencia_tabla: "accounting.journal_entries",
          },
        ],
        [preparation]
      )
    ).toEqual([
      {
        key: `${preparation.id}:net:reversal`,
        message:
          "Neto: el asiento tiene una reversión o un contra-asiento; requiere revisión.",
      },
    ]);
  });

  it("flags a reversal link even if the contra-entry is missing from history", () => {
    const issues = reviewMeliPaymentDispatches(
      [{ ...original, anulado_por_id: "00000000-0000-4000-8000-000000000008" }],
      [preparation]
    );
    expect(issues).toEqual([
      {
        key: `${preparation.id}:net:reversal`,
        message: expect.stringContaining("requiere revisión"),
      },
    ]);
  });

  it("does not associate a contra-entry for a different original or reference type", () => {
    const unrelated = {
      ...original,
      id: "00000000-0000-4000-8000-000000000008",
      tipo_evento: "CONTRA_ASIENTO",
      referencia_id: original.id,
      referencia_tabla: "other",
    };
    expect(
      reviewMeliPaymentDispatches([original, unrelated], [preparation])
    ).toEqual([]);
  });
});
