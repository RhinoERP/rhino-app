import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliPaymentAccountingHistory } from "./meli-payment-accounting-history";

const mocks = vi.hoisted(() => ({ entries: vi.fn() }));
vi.mock(
  "@/modules/mercadolibre/service/meli-accounting-drafts.service",
  () => ({
    listMeliPaymentJournalEntries: mocks.entries,
  })
);
const props = { orgSlug: "org", paymentId: "payment" };

describe("Meli payment accounting history", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows a cautious message when no linked entries exist", async () => {
    mocks.entries.mockResolvedValueOnce([]);
    const markup = renderToStaticMarkup(
      await MeliPaymentAccountingHistory(props)
    );
    expect(markup).toContain("No se encontraron asientos");
    expect(markup).toContain("requieren revisión manual");
  });

  it("lists original entries and their reversals without claiming completion", async () => {
    mocks.entries.mockResolvedValueOnce([
      {
        id: "original",
        tipo_evento: "MELI_COBRO",
        estado: "ACTIVO",
        fecha: "2026-11-21",
        anulado_por_id: null,
      },
      {
        id: "reversal",
        tipo_evento: "CONTRA_ASIENTO",
        estado: "ACTIVO",
        fecha: "2026-11-21",
        referencia_id: "original",
        anulado_por_id: null,
      },
    ]);
    const markup = renderToStaticMarkup(
      await MeliPaymentAccountingHistory(props)
    );
    expect(markup).toContain("MELI_COBRO");
    expect(markup).toContain("Contra-asiento");
    expect(markup).toContain("Asiento original: ");
    expect(markup).toContain("no confirma que la liquidación esté completa");
  });

  it("reports an unavailable ledger rather than showing an empty history", async () => {
    mocks.entries.mockRejectedValueOnce(new Error("Servicio caído"));
    const markup = renderToStaticMarkup(
      await MeliPaymentAccountingHistory(props)
    );
    expect(markup).toContain("No se pudo consultar");
    expect(markup).not.toContain("No se encontraron");
  });

  it("warns when a published receipt is absent without claiming reconciliation", async () => {
    mocks.entries.mockResolvedValueOnce([]);
    const markup = renderToStaticMarkup(
      await MeliPaymentAccountingHistory({
        ...props,
        preparations: [
          {
            id: "preparation",
            draft_id: "draft",
            status: "PREPARED",
            created_by: "actor",
            created_at: "2026-11-23T12:00:00Z",
            cancelled_by: null,
            cancelled_at: null,
            components: [
              {
                key: "net",
                description: "Neto",
                amount: "100.00",
                dispatchStatus: "PUBLISHED",
                journalEntryId: "entry",
              },
            ],
          },
        ],
      })
    );
    expect(markup).toContain("no aparece en la historia");
    expect(markup).not.toContain("conciliado");
  });

  it("warns when a published receipt has an active contra-entry", async () => {
    mocks.entries.mockResolvedValueOnce([
      {
        id: "original",
        tipo_evento: "MELI_COBRO",
        estado: "ACTIVO",
        fecha: "2026-11-23",
        anulado_por_id: null,
      },
      {
        id: "reversal",
        tipo_evento: "CONTRA_ASIENTO",
        referencia_tabla: "accounting.journal_entries",
        referencia_id: "original",
        estado: "ACTIVO",
        fecha: "2026-11-23",
        anulado_por_id: null,
      },
    ]);
    const markup = renderToStaticMarkup(
      await MeliPaymentAccountingHistory({
        ...props,
        preparations: [
          {
            id: "preparation",
            draft_id: "draft",
            status: "PREPARED",
            created_by: "actor",
            created_at: "2026-11-23T12:00:00Z",
            cancelled_by: null,
            cancelled_at: null,
            components: [
              {
                key: "net",
                description: "Neto",
                amount: "100.00",
                dispatchStatus: "PUBLISHED",
                journalEntryId: "original",
              },
            ],
          },
        ],
      })
    );
    expect(markup).toContain(
      "el asiento tiene una reversión o un contra-asiento"
    );
    expect(markup).toContain("requiere revisión");
  });
});
