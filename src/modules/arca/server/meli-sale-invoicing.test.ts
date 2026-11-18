import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildArcaVoucherRequestFromSale,
  emitSaleInvoice,
  validateSaleForArcaInvoicing,
} from "./sale-invoicing.service";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  ensure: vi.fn(),
  admin: vi.fn(),
  normal: vi.fn(),
  eq: vi.fn(),
  credentials: vi.fn(),
  authorize: vi.fn(),
  info: vi.fn(),
  receivable: vi.fn(),
  regenerate: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/mercadolibre/service/meli-read.service", () => ({
  getMeliSale: mocks.scope,
}));
vi.mock("@/modules/mercadolibre/service/meli-fiscal-settings.service", () => ({
  assertMeliInvoiceChoice: vi.fn(),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.normal }));
vi.mock("./access", () => ({
  assertCanIssueOrganizationArca: vi.fn(),
  getCurrentUserOrganizationArcaAccess: async () => ({
    organization: { id: "org", cuit: "30711833397" },
    userId: "actor",
    permissions: ["mercadolibre.invoice"],
  }),
}));
vi.mock("./client-factory", () => ({
  resolveArcaOrganizationCredentials: mocks.credentials,
  isArcaCertificateExpired: () => false,
  createArcaClientFromCredentials: () => ({
    ElectronicBilling: {
      createNextVoucher: mocks.authorize,
      createVoucher: mocks.authorize,
      getLastVoucher: async () => 6,
      getVoucherInfo: mocks.info,
    },
  }),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  ensureReceivableForAuthorizedPreventaInvoice: mocks.receivable,
  regenerateSaleLevelRemito: vi.fn(),
}));
vi.mock("@/modules/orders/server/regenerate-order-remitos.service", () => ({
  regenerateChildOrderRemitos: vi.fn(),
}));
vi.mock("@/modules/sales/remittance-regeneration", () => ({
  regenerateAuthorizedSaleRemittances: mocks.regenerate,
}));

const receiver = {
  version: 1,
  tax_condition: "CONSUMIDOR_FINAL",
  document_type: "DNI",
  document_number: "12345678",
  first_name: "Ana",
  last_name: "Pérez",
  address: "Calle 123",
};
const updatedAt = "2026-11-15T12:00:00+00:00";
const params = {
  orgSlug: "org",
  saleId: "00000000-0000-4000-8000-000000000001",
  salesChannel: "MERCADO_LIBRE" as const,
};
let row: Record<string, unknown>;

describe("Meli through the shared A/B/C fiscal engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    row = {
      id: params.saleId,
      organization_id: "org",
      updated_at: updatedAt,
      status: "DELIVERED",
      document_type: "STANDARD",
      parent_sales_order_id: null,
      sale_date: "2026-11-15",
      expiration_date: null,
      credit_days: 0,
      invoice_type: "FACTURA_B",
      invoice_number: null,
      sub_total: 100,
      total_amount: 121,
      total_tax_amount: 21,
      currency: "ARS",
      commercial_exchange_rate: null,
      global_discount_amount: 0,
      arca_status: "not_requested",
      arca_cae: null,
      arca_cae_expires_at: null,
      arca_authorized_at: null,
      arca_point_of_sale: null,
      arca_voucher_number: null,
      arca_voucher_type_code: null,
      arca_last_error: null,
      arca_request_json: null,
      arca_response_json: null,
      customer: null,
      customer_id: null,
      items: [
        {
          id: "item",
          product_id: "product",
          description: "Producto vendido",
          quantity: 1,
          unit_quantity: null,
          unit_price: 100,
          base_price: 100,
          discount_amount: 0,
          discount_percentage: 0,
          subtotal: 100,
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
          tax: { code: "IVA_21" },
        },
      ],
    };
    mocks.scope.mockImplementation(async () => ({
      receiver,
      customer_id: row.customer_id,
      updated_at: row.updated_at,
    }));
    mocks.ensure.mockResolvedValue(undefined);
    mocks.credentials.mockResolvedValue({
      pointOfSale: 2,
      cert: "cert",
      key: "key",
      environment: "dev",
      settings: {
        status: "connected",
        invoice_a_authorization_type: "standard",
      },
    });
    mocks.authorize.mockResolvedValue({
      CAE: "86462382117559",
      CAEFchVto: "2026-11-25",
      voucherNumber: 7,
    });
    mocks.info.mockResolvedValue(null);
    mocks.from.mockImplementation(() => {
      let patch: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          mocks.eq(key, value);
          return query;
        },
        in: () => query,
        update: (values: Record<string, unknown>) => {
          patch = values;
          return query;
        },
        maybeSingle: () => {
          if (patch) {
            row = { ...row, ...patch };
          }
          return Promise.resolve({ data: row, error: null });
        },
        single: () => {
          if (patch) {
            row = { ...row, ...patch };
          }
          return Promise.resolve({ data: row, error: null });
        },
      };
      return query;
    });
    mocks.admin.mockReturnValue({ from: mocks.from });
  });
  it("uses a real DNI and no synthetic customer for the occasional CF", async () => {
    const result = await validateSaleForArcaInvoicing(params);
    if (!result.context) {
      throw new Error("Missing context");
    }
    expect(result.context.sale.customer.id).toBeNull();
    expect(result.context.sale.customer.businessName).toBe("Ana Pérez");
    const request = buildArcaVoucherRequestFromSale(result.context, {
      code: "PES",
      rate: 1,
      sameCurrencySettlement: false,
    });
    expect(request).toMatchObject({
      DocTipo: 96,
      DocNro: 12_345_678,
      CondicionIVAReceptorId: 5,
      CbteTipo: 6,
      ImpTotal: 121,
      ImpIVA: 21,
    });
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
  });
  it("ignores changed permanent-customer fields and keeps the sale snapshot", async () => {
    row.customer_id = "registered";
    row.customer = {
      id: "registered",
      business_name: "Nombre modificado",
      cuit: "otro",
      tax_condition: "RESPONSABLE_INSCRIPTO",
    };
    const result = await validateSaleForArcaInvoicing(params);
    expect(result.context?.sale.customer).toMatchObject({
      id: "registered",
      businessName: "Ana Pérez",
      cuit: null,
      document: { type: "DNI", number: "12345678" },
    });
  });
  it("checks scoped Meli access before acquiring an elevated persistence client", async () => {
    mocks.scope.mockResolvedValueOnce(null);
    await expect(validateSaleForArcaInvoicing(params)).rejects.toThrow(
      "fuera de tus depósitos"
    );
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("authorizes once, without receivables or legacy remittance regeneration", async () => {
    const first = await emitSaleInvoice(params);
    expect(first.status).toBe("authorized");
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith("updated_at", updatedAt);
    expect(mocks.receivable).not.toHaveBeenCalled();
    expect(mocks.regenerate).not.toHaveBeenCalled();
    expect(mocks.normal).not.toHaveBeenCalled();
    const replay = await emitSaleInvoice(params);
    expect(replay.idempotent).toBe(true);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  });
  it("does not resubmit a pending or uncertain fiscal request", async () => {
    row.arca_status = "pending";
    await expect(emitSaleInvoice(params)).rejects.toThrow(
      "emisión fiscal en curso"
    );
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("issues A to an occasional RI and preserves the issuer's withholding legend", async () => {
    row.invoice_type = "FACTURA_A";
    mocks.scope.mockResolvedValueOnce({
      updated_at: updatedAt,
      customer_id: null,
      receiver: {
        version: 1,
        tax_condition: "RESPONSABLE_INSCRIPTO",
        document_type: "CUIT",
        document_number: "30711833397",
        business_name: "Comprador ocasional",
        address: "Calle 123",
      },
    });
    mocks.credentials.mockResolvedValueOnce({
      pointOfSale: 2,
      cert: "cert",
      key: "key",
      environment: "dev",
      settings: {
        status: "connected",
        invoice_a_authorization_type: "operation_subject_to_withholding",
      },
    });
    await emitSaleInvoice(params);
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        DocTipo: 80,
        DocNro: 30_711_833_397,
        CondicionIVAReceptorId: 1,
        CbteTipo: 51,
      })
    );
    expect(row.invoice_type).toBe("FACTURA_A_RETENCION");
    expect(mocks.receivable).not.toHaveBeenCalled();
  });
  it("builds C without IVA/tributos when its persisted snapshot has none", async () => {
    row.invoice_type = "FACTURA_C";
    row.total_amount = 100;
    row.total_tax_amount = 0;
    row.taxes = [];
    const validation = await validateSaleForArcaInvoicing(params);
    if (!validation.context) {
      throw new Error("Missing context");
    }
    const request = buildArcaVoucherRequestFromSale(validation.context, {
      code: "PES",
      rate: 1,
      sameCurrencySettlement: false,
    });
    expect(request).toMatchObject({
      CbteTipo: 11,
      ImpTotal: 100,
      ImpNeto: 100,
      ImpIVA: 0,
      ImpTrib: 0,
    });
    expect(request).not.toHaveProperty("Iva");
  });
});
