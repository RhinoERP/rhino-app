import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MeliAccountingDraft } from "./meli-accounting-draft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/modules/accounting/queries/queries.client", () => ({
  useCuentas: () => ({ data: [], isError: false }),
}));
vi.mock("@/modules/mercadolibre/actions/meli-accounting-drafts.action", () => ({
  saveMeliAccountingDraftAction: vi.fn(),
}));

const props = {
  orgSlug: "org",
  orgId: "org-id",
  paymentId: "payment-id",
  currency: "USD" as const,
  history: [],
};

describe("Meli accounting draft interface", () => {
  it("labels the draft accurately and presents the four components", () => {
    const markup = renderToStaticMarkup(
      <MeliAccountingDraft {...props} editable />
    );
    expect(markup).toContain("Este borrador no publica asientos");
    expect(markup).toContain("Neto acreditado");
    expect(markup).toContain("Descuento");
    expect(markup).toContain("Comisión");
    expect(markup).toContain("Envío");
    expect(markup).toContain("Guardar borrador");
    expect(markup).toContain("USD");
  });

  it("does not offer editing for voided payments", () => {
    const history = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        version: 1,
        active: true,
        request_payload: {
          breakdown: {
            net: "80",
            discount: "5",
            commission: "10",
            shipping: "5",
            manualConcepts: [],
          },
          evidence: "Referencia de liquidación",
        },
        gross_amount: "100.00",
        currency: "USD" as const,
        payment_date: "2026-11-21",
        created_by: "00000000-0000-4000-8000-000000000002",
        created_at: "2026-11-21T12:00:00Z",
      },
    ];
    const markup = renderToStaticMarkup(
      <MeliAccountingDraft {...props} editable={false} history={history} />
    );
    expect(markup).not.toContain("Guardar borrador");
    expect(markup).not.toContain("Agregar ajuste manual");
    expect(markup).toContain("Versión");
    expect(markup).toContain("Referencia de liquidación");
    expect(markup).toContain("Vista previa de conceptos");
    expect(markup).toContain("MERCADO_PAGO");
    expect(markup).toContain("AR_DEUDORES_VENTAS");
    expect(markup).toContain("No se generaron asientos");
  });
});
