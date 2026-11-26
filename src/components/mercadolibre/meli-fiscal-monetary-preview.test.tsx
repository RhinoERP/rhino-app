import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MeliFiscalMonetaryPreview } from "./meli-fiscal-monetary-preview";

vi.mock("@/modules/accounting/queries/queries.client", () => ({
  useCuentas: () => ({ data: [], isLoading: false, isError: false }),
}));

describe("Meli fiscal proposal UI", () => {
  it("offers explicitly labeled account choices without claiming publication", () => {
    const markup = renderToStaticMarkup(
      <MeliFiscalMonetaryPreview
        orgId="org"
        orgSlug="org"
        origin={{
          type: "creditNote",
          saleId: "00000000-0000-4000-8000-000000000001",
          creditNoteId: "00000000-0000-4000-8000-000000000002",
        }}
        snapshot={{
          date: "2026-11-23",
          currency: "ARS",
          exchangeRate: 1,
          total: "121.00",
          net: "100.00",
          exempt: "0.00",
          nonTaxable: "0.00",
          vat: "21.00",
          otherTaxes: "0.00",
          vatItems: [{ id: 5, amount: "21.00" }],
          tributeItems: [],
        }}
      />
    );
    expect(markup).toContain("Deudores");
    expect(markup).toContain("Neto gravado");
    expect(markup).toContain("IVA ARCA 5");
    expect(markup).toContain("No se crea ningún asiento");
    expect(markup).not.toContain("Publicado");
  });
});
