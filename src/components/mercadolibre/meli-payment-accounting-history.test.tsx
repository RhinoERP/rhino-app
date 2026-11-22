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
});
