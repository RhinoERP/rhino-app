import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArcaValidationError } from "@/modules/arca/errors";
import {
  generateMeliInvoiceHtml,
  tryAutomaticMeliInvoice,
} from "./meli-invoice.service";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  row: vi.fn(),
  layout: vi.fn(),
  emit: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./meli-read.service", () => ({ getMeliSale: mocks.scope }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));
vi.mock("@/modules/arca/server/sale-invoicing.service", () => ({
  emitSaleInvoice: mocks.emit,
}));
vi.mock("@/modules/arca/server/html-to-pdf.service", () => ({
  paginateFiscalInvoiceHtml: (html: string) => Promise.resolve(html),
}));
vi.mock("@/modules/organizations/service/org-settings.service", () => ({
  getOrgSettings: () => Promise.resolve({ invoice_print_duplicate: false }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationLayoutData: mocks.layout,
  getOrganizationBySlug: () =>
    Promise.resolve({ id: "org", name: "Emisor", cuit: "30711833397" }),
}));
vi.mock("@/modules/arca/server/repository", () => ({
  getOrganizationArcaSettingsByOrganizationId: () => Promise.resolve(null),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesOrderById: vi.fn(),
}));
vi.mock("@/modules/orders/service/orders.service", () => ({
  getOrderQuotePaymentConditionBySaleId: vi.fn(),
}));

const saleId = "00000000-0000-4000-8000-000000000001";
let sale: Record<string, unknown>;
describe("Meli invoice rendering and automatic issuance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sale = {
      id: saleId,
      sale_number: 1,
      customer_id: null,
      warehouse_id: "warehouse",
      status: "DELIVERED",
      credit_days: 0,
      sale_date: "2026-11-15",
      invoice_type: "FACTURA_B",
      invoice_number: "0002-00000007",
      currency: "ARS",
      commercial_exchange_rate: null,
      total_amount: 121,
      sub_total: 100,
      global_discount_amount: 0,
      remittance_number: null,
      observations: null,
      arca_status: "authorized",
      arca_point_of_sale: 2,
      arca_voucher_number: 7,
      arca_voucher_type_code: 6,
      arca_cae: "86462382117559",
      arca_cae_expires_at: "2026-11-25",
      arca_authorized_at: "2026-11-15T12:00:00Z",
      arca_request_json: {
        wsfeRequest: {
          DocTipo: 96,
          DocNro: 12_345_678,
          CbteFch: 20_261_115,
          MonId: "PES",
          MonCotiz: 1,
        },
      },
      fiscal_receiver_snapshot: {
        version: 1,
        tax_condition: "CONSUMIDOR_FINAL",
        document_type: "DNI",
        document_number: "12345678",
        first_name: "Ana",
        last_name: "Pérez",
        address: "Domicilio de la operación",
      },
      commercial_snapshot: {
        meli_items: {
          item: {
            name: "Camisa - M / Azul",
            sku: "SKU-ORIGINAL",
            brand: null,
            variant_name: "M / Azul",
            unit_of_measure: "UN",
            tracks_stock_units: false,
          },
        },
      },
      items: [
        {
          id: "item",
          product_id: "product",
          product_variant_id: "variant",
          description: "Descripción alterada",
          quantity: 1,
          unit_quantity: null,
          unit_price: 100,
          base_price: 100,
          discount_percentage: 0,
          subtotal: 100,
          product: {
            name: "Catálogo modificado",
            sku: "SKU-NUEVO",
            unit_of_measure: "UN",
            tracks_stock_units: false,
          },
          variant: { talle: "XL", color: "Rojo" },
        },
      ],
      taxes: [
        {
          id: "tax",
          tax_id: "vat",
          name: "IVA",
          rate: 21,
          tax_amount: 21,
          base_amount: 100,
          tax_code_snapshot: "IVA_21",
        },
      ],
    };
    mocks.scope.mockImplementation(() =>
      Promise.resolve({
        warehouse_id: "warehouse",
        arca_status: sale.arca_status,
      })
    );
    mocks.layout.mockResolvedValue({ permissions: ["mercadolibre.manage"] });
    mocks.row.mockImplementation(() =>
      Promise.resolve({ data: sale, error: null })
    );
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          mocks.eq(key, value);
          return query;
        },
        maybeSingle: mocks.row,
      };
      return query;
    });
    mocks.admin.mockReturnValue({ from: mocks.from });
  });
  it("renders DNI, buyer, persisted labels, taxes and CAE without a permanent customer", async () => {
    const result = await generateMeliInvoiceHtml("org", saleId);
    expect(result.html).toContain("Ana Pérez");
    expect(result.html).toContain("12345678");
    expect(result.html).toContain("Domicilio de la operación");
    expect(result.html).toContain("Camisa - M / Azul");
    expect(result.html).toContain("SKU-ORIGINAL");
    expect(result.html).not.toContain("SKU-NUEVO");
    expect(result.html).not.toContain("Descripción alterada");
    expect(result.html).not.toContain("Rojo");
    expect(result.html).toContain("86462382117559");
    expect(result.html).toContain("121,00");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
  });
  it("rejects pending invoices and orphaned line snapshots", async () => {
    sale.arca_status = "pending";
    await expect(generateMeliInvoiceHtml("org", saleId)).rejects.toThrow(
      "autorizada"
    );
    sale.arca_status = "authorized";
    sale.commercial_snapshot = { meli_items: {} };
    await expect(generateMeliInvoiceHtml("org", saleId)).rejects.toThrow(
      "Falta el snapshot"
    );
  });
  it("does not load a document outside the scoped warehouse/channel", async () => {
    mocks.scope.mockResolvedValueOnce(null);
    await expect(generateMeliInvoiceHtml("org", saleId)).rejects.toThrow(
      "fuera de tus depósitos"
    );
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not automatically issue on behalf of a user without the fiscal permission", async () => {
    expect(await tryAutomaticMeliInvoice("org", saleId)).toBeNull();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("returns a fiscal warning rather than losing the already recorded sale", async () => {
    mocks.layout.mockResolvedValueOnce({
      permissions: ["mercadolibre.invoice"],
    });
    mocks.emit.mockRejectedValueOnce(
      new ArcaValidationError("ARCA no disponible")
    );
    expect(await tryAutomaticMeliInvoice("org", saleId)).toBe(
      "ARCA no disponible"
    );
  });
});
