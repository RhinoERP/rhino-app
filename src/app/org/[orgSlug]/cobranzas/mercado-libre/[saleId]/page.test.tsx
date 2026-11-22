import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeliCollectionSalePage from "./page";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  history: vi.fn(),
  enabled: vi.fn(),
  drafts: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/collections/collections-section-nav", () => ({
  CollectionsSectionNav: () => null,
}));
vi.mock("@/components/mercadolibre/meli-payment-form", () => ({
  MeliPaymentForm: () => null,
  VoidMeliPaymentForm: () => <span>Anular cobro</span>,
}));
vi.mock("@/components/mercadolibre/meli-accounting-draft", () => ({
  MeliAccountingDraft: ({ editable }: { editable: boolean }) => (
    <span>{editable ? "Borrador editable" : "Borrador histórico"}</span>
  ),
}));
vi.mock("@/components/mercadolibre/meli-payment-accounting-history", () => ({
  MeliPaymentAccountingHistory: () => <span>Asientos vinculados</span>,
}));
vi.mock("@/modules/collections/service/collections-access.service", () => ({
  getCollectionsPageAccess: mocks.access,
}));
vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isMeliAccountingIntegrationEnabled: mocks.enabled,
}));
vi.mock("@/modules/mercadolibre/service/meli-payments.service", () => ({
  getMeliPaymentHistory: mocks.history,
}));
vi.mock(
  "@/modules/mercadolibre/service/meli-accounting-drafts.service",
  () => ({
    listMeliAccountingDrafts: mocks.drafts,
  })
);

const params = {
  params: Promise.resolve({
    orgSlug: "org",
    saleId: "00000000-0000-4000-8000-000000000001",
  }),
  searchParams: Promise.resolve({}),
};

describe("Meli collections accounting drafts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({
      layout: {
        permissions: ["organization.admin"],
        currentOrganization: { id: "org-id" },
      },
      sections: {},
    });
    mocks.enabled.mockResolvedValue(false);
    mocks.drafts.mockResolvedValue([]);
    mocks.history.mockResolvedValue({
      sale: {
        saleNumber: 1,
        marketplaceOrderNumber: "order",
        saleDate: "2026-11-21",
        warehouseName: "Depósito",
        buyerName: "Comprador",
        receiver: { document_type: "DNI", document_number: "1", address: "" },
        totalAmount: 100,
        collectedAmount: 100,
        outstandingAmount: 0,
        currency: "ARS",
        status: "PAID",
        saleStatus: "DELIVERED",
        invoiceNumber: "1",
        canRegister: false,
      },
      data: [
        {
          id: "payment",
          amount: 100,
          currency: "ARS",
          payment_date: "2026-11-21",
          status: "RECORDED",
          reference_number: "reference",
          notes: "",
          created_at: "2026-11-21T12:00:00Z",
          created_by: "user",
          fiscal_receiver_snapshot: {
            document_type: "DNI",
            document_number: "1",
          },
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 10,
    });
  });

  it("does not fetch or expose drafts while integration is disabled", async () => {
    const markup = renderToStaticMarkup(await MeliCollectionSalePage(params));
    expect(markup).not.toContain("Borrador editable");
    expect(markup).not.toContain("Asientos vinculados");
    expect(mocks.drafts).not.toHaveBeenCalled();
    expect(markup).not.toContain("No se pudo consultar la configuración");
  });

  it("fetches drafts for authorized users only when enabled", async () => {
    mocks.enabled.mockResolvedValue(true);
    const markup = renderToStaticMarkup(await MeliCollectionSalePage(params));
    expect(markup).toContain("Borrador editable");
    expect(markup).toContain("Asientos vinculados");
    expect(mocks.drafts).toHaveBeenCalledWith("org", "payment");
  });

  it("only exposes history for a voided collection", async () => {
    mocks.enabled.mockResolvedValue(true);
    const history = await mocks.history();
    history.data[0].status = "VOIDED";
    history.data[0].void_reason = "Carga incorrecta";
    const markup = renderToStaticMarkup(await MeliCollectionSalePage(params));
    expect(markup).toContain("Borrador histórico");
    expect(markup).not.toContain("Borrador editable");
  });

  it("does not query accounting data without the required permissions", async () => {
    mocks.access.mockResolvedValue({
      layout: {
        permissions: ["mercadolibre.payments.read"],
        currentOrganization: { id: "org-id" },
      },
      sections: {},
    });
    mocks.enabled.mockResolvedValue(true);
    const markup = renderToStaticMarkup(await MeliCollectionSalePage(params));
    expect(markup).not.toContain("Borrador editable");
    expect(mocks.enabled).not.toHaveBeenCalled();
    expect(mocks.drafts).not.toHaveBeenCalled();
  });

  it("keeps collections accessible and reports a configuration lookup failure", async () => {
    mocks.enabled.mockRejectedValue(new Error("Configuración inaccesible"));
    const markup = renderToStaticMarkup(await MeliCollectionSalePage(params));
    expect(markup).toContain("Cobros de venta Meli #1");
    expect(markup).toContain("Anular cobro");
    expect(markup).toContain("No se pudo consultar la configuración contable");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Borrador editable");
    expect(markup).not.toContain("Asientos vinculados");
    expect(mocks.drafts).not.toHaveBeenCalled();
  });
});
