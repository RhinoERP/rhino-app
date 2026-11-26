import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MeliSaleAccountingReview,
  MeliSaleAccountingReviewResult,
} from "./meli-sale-accounting-review";

vi.mock(
  "@/modules/mercadolibre/actions/meli-sale-accounting-review.action",
  () => ({
    reviewMeliSaleAccountingAction: vi.fn(),
  })
);

describe("revisión contable por venta", () => {
  it("only starts on request", () => {
    const markup = renderToStaticMarkup(
      <MeliSaleAccountingReview orgSlug="org" saleId="sale" />
    );
    expect(markup).toContain("Revisar contabilidad de la venta");
    expect(markup).not.toContain("Factura:");
  });

  it("shows sources and uncertainties without claiming full reconciliation", () => {
    const markup = renderToStaticMarkup(
      <MeliSaleAccountingReviewResult
        result={{
          success: true,
          data: {
            saleId: "sale",
            currency: "USD",
            amount: "100.00",
            invoiceStatus: "authorized",
            invoice: { dispatchStatus: "PUBLISHED", issues: [] },
            issues: [],
            notes: [
              {
                id: "note",
                amount: "20.00",
                currency: "USD",
                status: "CONFIRMED",
                fiscalStatus: "authorized",
                dispatchStatus: "UNCERTAIN",
                issues: ["Envío fiscal incierto"],
              },
            ],
            payments: [
              {
                id: "payment",
                amount: "80.00",
                currency: "USD",
                status: "RECORDED",
                reversalStatus: null,
                components: [
                  {
                    preparationId: "prep",
                    key: "net",
                    description: "Neto",
                    dispatchStatus: null,
                  },
                ],
                issues: ["Componente sin enviar"],
              },
            ],
          },
        }}
      />
    );
    expect(markup).toContain("Envío fiscal incierto");
    expect(markup).toContain("Componente sin enviar");
    expect(markup).toContain("no autoriza publicar o anular");
    expect(markup).toContain("no representan el saldo contable");
  });

  it("does not render a partial result as a successful review", () => {
    const markup = renderToStaticMarkup(
      <MeliSaleAccountingReviewResult
        result={{ success: false, error: "Servicio caído" }}
      />
    );
    expect(markup).toContain("Servicio caído");
    expect(markup).not.toContain("Sin discrepancias");
  });
});
