import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesOrderDetail } from "@/modules/sales/service/sales.service";
import type { ManualFiscalInvoice } from "./manual-fiscal-invoices.service";

// @ts-expect-error Vitest accepts virtual mocks at runtime for this Next.js marker.
vi.mock("server-only", () => ({}), { virtual: true });

const mocks = vi.hoisted(() => ({
  getSalesOrderById: vi.fn(),
  getManualFiscalInvoiceById: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getOrganizationArcaSettingsByOrganizationId: vi.fn(),
}));

vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesOrderById: mocks.getSalesOrderById,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));
vi.mock("./manual-fiscal-invoices.service", () => ({
  getManualFiscalInvoiceById: mocks.getManualFiscalInvoiceById,
}));
vi.mock("./repository", () => ({
  getOrganizationArcaSettingsByOrganizationId:
    mocks.getOrganizationArcaSettingsByOrganizationId,
}));

import { generateAuthorizedSaleInvoicePdf } from "./fiscal-invoice-pdf.service";
import { generateAuthorizedManualFiscalInvoicePdf } from "./manual-fiscal-invoice-pdf.service";

const fiscalRequest = {
  wsfeRequest: {
    MonId: "DOL",
    MonCotiz: 1513.5,
    CanMisMonExt: "S",
    CbteFch: 20_260_917,
    DocTipo: 80,
    DocNro: 20_123_456_789,
  },
};

function sale(commercialRate: number | null, currency = "USD") {
  return {
    id: "sale-1",
    arca_status: "authorized",
    arca_request_json:
      currency === "USD"
        ? fiscalRequest
        : {
            wsfeRequest: {
              ...fiscalRequest.wsfeRequest,
              MonId: "PES",
              MonCotiz: 1,
            },
          },
    arca_point_of_sale: 2,
    arca_voucher_number: 6,
    arca_voucher_type_code: 1,
    arca_cae: "12345678901234",
    arca_cae_expires_at: "2026-09-27",
    arca_authorized_at: "2026-09-17T12:00:00Z",
    sale_date: "2026-09-17",
    sale_number: 16,
    invoice_number: "0002-00000006",
    invoice_type: "FACTURA_A",
    currency,
    commercial_exchange_rate: commercialRate,
    total_amount: 100,
    sub_total: 100,
    global_discount_amount: 0,
    customer: { business_name: "Cliente", cuit: "20123456789" },
    items: [],
    taxes: [],
  } as unknown as SalesOrderDetail;
}

function manualInvoice(commercialRate: number, currency = "USD") {
  return {
    id: "manual-1",
    status: "authorized",
    invoice_type: "FACTURA_A",
    invoice_number: "0002-00000007",
    issue_date: "2026-09-17",
    currency,
    exchange_rate: commercialRate,
    total_amount: 100,
    sub_total: 100,
    total_tax_amount: 0,
    arca_point_of_sale: 2,
    arca_voucher_number: 7,
    arca_voucher_type_code: 1,
    arca_cae: "12345678901234",
    arca_request_json:
      currency === "USD"
        ? fiscalRequest
        : {
            wsfeRequest: {
              ...fiscalRequest.wsfeRequest,
              MonId: "PES",
              MonCotiz: 1,
            },
          },
    customer: { business_name: "Cliente", cuit: "20123456789" },
    items: [],
  } as unknown as ManualFiscalInvoice;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationBySlug.mockResolvedValue({
    id: "org-1",
    name: "Test",
    cuit: "30123456789",
  });
  mocks.getOrganizationArcaSettingsByOrganizationId.mockResolvedValue(null);
});

describe("commercial rate in generated invoice PDFs", () => {
  it("shows the commercial rate on a sale without printing the fiscal rate", async () => {
    mocks.getSalesOrderById.mockResolvedValue(sale(1535));
    const result = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    expect(result.html).toContain("Tipo de cambio comercial USD → ARS");
    expect(result.html).toContain("1 USD = ARS 1.535,00");
    expect(result.html).not.toContain("1 USD = ARS 1.513,50");
  });

  it("marks an unavailable historical commercial rate and omits it for ARS", async () => {
    mocks.getSalesOrderById.mockResolvedValueOnce(sale(null));
    const historical = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    expect(historical.html).toContain("no disponible");
    mocks.getSalesOrderById.mockResolvedValueOnce(sale(null, "ARS"));
    const ars = await generateAuthorizedSaleInvoicePdf({
      orgSlug: "test",
      saleId: "sale-1",
    });
    expect(ars.html).not.toContain("Tipo de cambio comercial USD → ARS");
  });

  it("shows the manually entered commercial rate only for manual USD invoices", async () => {
    mocks.getManualFiscalInvoiceById.mockResolvedValueOnce(manualInvoice(1535));
    const usd = await generateAuthorizedManualFiscalInvoicePdf({
      orgSlug: "test",
      invoiceId: "manual-1",
    });
    expect(usd.html).toContain("Tipo de cambio comercial USD → ARS");
    expect(usd.html).toContain("1 USD = ARS 1.535,00");
    mocks.getManualFiscalInvoiceById.mockResolvedValueOnce(
      manualInvoice(1, "ARS")
    );
    const ars = await generateAuthorizedManualFiscalInvoicePdf({
      orgSlug: "test",
      invoiceId: "manual-1",
    });
    expect(ars.html).not.toContain("Tipo de cambio comercial USD → ARS");
  });
});
