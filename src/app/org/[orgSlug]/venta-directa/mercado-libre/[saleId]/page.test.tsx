import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeliSalePage from "./page";

const mocks = vi.hoisted(() => ({
  sale: vi.fn(),
  layout: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/mercadolibre/meli-credit-notes", () => ({
  MeliCreditNotes: ({
    canReviewAccounting,
  }: {
    canReviewAccounting: boolean;
  }) =>
    canReviewAccounting ? <span>Revisión de notas habilitada</span> : null,
}));
vi.mock("@/components/mercadolibre/meli-fiscal-accounting-history", () => ({
  MeliFiscalAccountingHistory: () => (
    <span>Revisión de factura habilitada</span>
  ),
}));
vi.mock("@/components/mercadolibre/meli-invoice-actions", () => ({
  MeliInvoiceActions: () => <span>Acciones de factura</span>,
}));
vi.mock("@/components/mercadolibre/meli-physical-returns", () => ({
  MeliPhysicalReturns: () => null,
}));
vi.mock("@/components/mercadolibre/meli-receiver-correction", () => ({
  MeliReceiverCorrection: () => null,
}));
vi.mock("@/modules/mercadolibre/service/meli-read.service", () => ({
  getMeliSale: mocks.sale,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationLayoutData: mocks.layout,
}));
vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isMeliAccountingIntegrationEnabled: mocks.enabled,
}));
vi.mock("@/modules/mercadolibre/service/meli-credit-note-read.service", () => ({
  listMeliCreditNotes: async () => ({ notes: [], remaining: 100 }),
}));
vi.mock("@/modules/mercadolibre/service/meli-physical-return.service", () => ({
  listMeliPhysicalReturns: async () => ({}),
}));
vi.mock("@/modules/mercadolibre/service/meli-payments.service", () => ({
  getMeliPaymentSale: async () => null,
}));

const params = {
  params: Promise.resolve({ orgSlug: "org", saleId: "sale" }),
};

describe("Meli sale fiscal accounting visibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.sale.mockResolvedValue({
      id: "sale",
      sale_number: 1,
      marketplace_order_number: "order",
      sale_date: "2026-11-21",
      warehouseName: "Depósito",
      invoice_type: "B",
      arca_status: "authorized",
      status: "DELIVERED",
      receiver: {
        tax_condition: "CONSUMIDOR_FINAL",
        first_name: "Comprador",
        last_name: "",
        document_type: "DNI",
        document_number: "1",
        address: "",
      },
      items: [],
      taxes: [],
      total_amount: 100,
      global_discount_amount: 0,
      currency: "ARS",
    });
    mocks.layout.mockResolvedValue({ permissions: ["organization.admin"] });
    mocks.enabled.mockResolvedValue(false);
  });

  it("does not expose invoice or note accounting when disabled", async () => {
    const markup = renderToStaticMarkup(await MeliSalePage(params));
    expect(markup).not.toContain("Revisión de factura habilitada");
    expect(markup).not.toContain("Revisión de notas habilitada");
    expect(markup).not.toContain("No se pudo consultar la configuración");
  });

  it("exposes both histories when access and the integration are enabled", async () => {
    mocks.enabled.mockResolvedValue(true);
    const markup = renderToStaticMarkup(await MeliSalePage(params));
    expect(markup).toContain("Revisión de factura habilitada");
    expect(markup).toContain("Revisión de notas habilitada");
  });

  it("does not query the feature flag without accounting access", async () => {
    mocks.layout.mockResolvedValue({ permissions: ["mercadolibre.access"] });
    const markup = renderToStaticMarkup(await MeliSalePage(params));
    expect(markup).not.toContain("Revisión de factura habilitada");
    expect(markup).not.toContain("Revisión de notas habilitada");
    expect(mocks.enabled).not.toHaveBeenCalled();
  });

  it("keeps the sale accessible and reports a configuration lookup failure", async () => {
    mocks.enabled.mockRejectedValue(new Error("Configuración inaccesible"));
    const markup = renderToStaticMarkup(await MeliSalePage(params));
    expect(markup).toContain("Venta Meli #1");
    expect(markup).toContain("Acciones de factura");
    expect(markup).toContain("No se pudo consultar la configuración contable");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Revisión de factura habilitada");
    expect(markup).not.toContain("Revisión de notas habilitada");
  });
});
