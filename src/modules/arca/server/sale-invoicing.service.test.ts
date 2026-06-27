import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createArcaClientFromCredentials: vi.fn(),
  createClient: vi.fn(),
  formalizarEntry: vi.fn(),
  getCurrentUserOrganizationArcaAccess: vi.fn(),
  resolveArcaOrganizationCredentials: vi.fn(),
  sendSaleInvoiceEmail: vi.fn(),
}));

vi.mock("@/lib/accounting-server", () => ({
  formalizarEntry: mocks.formalizarEntry,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/modules/email/service/send-sale-invoice-email", () => ({
  sendSaleInvoiceEmail: mocks.sendSaleInvoiceEmail,
}));

vi.mock("server-only", () => ({}));

vi.mock("./access", () => ({
  getCurrentUserOrganizationArcaAccess:
    mocks.getCurrentUserOrganizationArcaAccess,
}));

vi.mock("./client-factory", async () => {
  const actual =
    await vi.importActual<typeof import("./client-factory")>(
      "./client-factory"
    );

  return {
    ...actual,
    createArcaClientFromCredentials: mocks.createArcaClientFromCredentials,
    resolveArcaOrganizationCredentials:
      mocks.resolveArcaOrganizationCredentials,
  };
});

import { emitSaleInvoice } from "./sale-invoicing.service";

type SalesOrderSelectRow = {
  id: string;
  organization_id: string;
  status: "CONFIRMED";
  sale_date: string;
  invoice_type: "FACTURA_B";
  invoice_number: string | null;
  sub_total: number;
  total_amount: number;
  total_tax_amount: number;
  global_discount_amount: number;
  arca_status: string;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json: Record<string, unknown> | null;
  arca_response_json: Record<string, unknown> | null;
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    cuit: string;
    tax_condition: string;
  };
  items: Array<{
    id: string;
    product_id: string | null;
    description: string;
    quantity: number;
    unit_quantity: number | null;
    unit_price: number;
    base_price: number;
    discount_amount: number | null;
    discount_percentage: number | null;
    subtotal: number;
  }>;
  taxes: Array<{
    id: string;
    tax_id: string;
    name: string;
    rate: number;
    tax_amount: number;
    base_amount: number;
    tax_code_snapshot: string;
    tax: {
      code: string;
    };
  }>;
};

type PersistedSaleRow = {
  id: string;
  arca_status: "pending" | "authorized";
  invoice_number: string | null;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json: Record<string, unknown> | null;
  arca_response_json: Record<string, unknown> | null;
  accounting_informal_entry_id: string | null;
};

function buildSaleSelectRow(): SalesOrderSelectRow {
  return {
    id: "sale-1",
    organization_id: "org-1",
    status: "CONFIRMED",
    sale_date: "2026-06-27",
    invoice_type: "FACTURA_B",
    invoice_number: null,
    sub_total: 100,
    total_amount: 121,
    total_tax_amount: 21,
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
    customer: {
      id: "customer-1",
      business_name: "Cliente Demo",
      fantasy_name: null,
      cuit: "20123456783",
      tax_condition: "MONOTRIBUTO",
    },
    items: [
      {
        id: "item-1",
        product_id: null,
        description: "Servicio gravado",
        quantity: 1,
        unit_quantity: null,
        unit_price: 121,
        base_price: 121,
        discount_amount: null,
        discount_percentage: null,
        subtotal: 121,
      },
    ],
    taxes: [
      {
        id: "tax-line-1",
        tax_id: "tax-1",
        name: "IVA 21%",
        rate: 21,
        tax_amount: 21,
        base_amount: 100,
        tax_code_snapshot: "IVA_21",
        tax: {
          code: "IVA_21",
        },
      },
    ],
  };
}

function buildAlreadyAuthorizedSaleSelectRow(): SalesOrderSelectRow {
  const baseRow = buildSaleSelectRow();

  return {
    id: baseRow.id,
    organization_id: baseRow.organization_id,
    status: baseRow.status,
    sale_date: baseRow.sale_date,
    invoice_type: baseRow.invoice_type,
    invoice_number: "0001-00000123",
    sub_total: baseRow.sub_total,
    total_amount: baseRow.total_amount,
    total_tax_amount: baseRow.total_tax_amount,
    global_discount_amount: baseRow.global_discount_amount,
    arca_status: "authorized",
    arca_cae: "70417054367476",
    arca_cae_expires_at: "2026-07-31T00:00:00.000Z",
    arca_authorized_at: "2026-06-27T12:00:00.000Z",
    arca_point_of_sale: 1,
    arca_voucher_number: 123,
    arca_voucher_type_code: 6,
    arca_request_json: {},
    arca_response_json: {
      authorization: {
        CAE: "70417054367476",
        CAEFchVto: "2026-07-31",
        voucherNumber: 123,
      },
    },
    arca_last_error: baseRow.arca_last_error,
    customer: baseRow.customer,
    items: baseRow.items,
    taxes: baseRow.taxes,
  };
}

function buildPendingRow(): PersistedSaleRow {
  return {
    id: "sale-1",
    arca_status: "pending",
    invoice_number: null,
    arca_cae: null,
    arca_cae_expires_at: null,
    arca_authorized_at: null,
    arca_point_of_sale: null,
    arca_voucher_number: null,
    arca_voucher_type_code: null,
    arca_last_error: null,
    arca_request_json: {},
    arca_response_json: null,
    accounting_informal_entry_id: null,
  };
}

function buildAuthorizedRow(
  accountingInformalEntryId: string | null
): PersistedSaleRow {
  return {
    id: "sale-1",
    arca_status: "authorized",
    invoice_number: "0001-00000123",
    arca_cae: "70417054367476",
    arca_cae_expires_at: "2026-07-31T00:00:00.000Z",
    arca_authorized_at: "2026-06-27T12:00:00.000Z",
    arca_point_of_sale: 1,
    arca_voucher_number: 123,
    arca_voucher_type_code: 6,
    arca_last_error: null,
    arca_request_json: {},
    arca_response_json: {
      authorization: {
        CAE: "70417054367476",
        CAEFchVto: "2026-07-31",
        voucherNumber: 123,
      },
    },
    accounting_informal_entry_id: accountingInformalEntryId,
  };
}

function createLoadSaleQuery(data: SalesOrderSelectRow) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
        })),
      })),
    })),
  };
}

function createMarkPendingQuery(
  payloads: Record<string, unknown>[],
  data: PersistedSaleRow
) {
  return {
    update: vi.fn((payload: Record<string, unknown>) => {
      payloads.push(payload);

      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
              })),
            })),
          })),
        })),
      };
    }),
  };
}

function createPersistAuthorizedQuery(
  payloads: Record<string, unknown>[],
  data: PersistedSaleRow
) {
  return {
    update: vi.fn((payload: Record<string, unknown>) => {
      payloads.push(payload);

      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data, error: null }),
            })),
          })),
        })),
      };
    }),
  };
}

function createPersistErrorQuery(payloads: Record<string, unknown>[]) {
  return {
    update: vi.fn((payload: Record<string, unknown>) => {
      payloads.push(payload);

      return {
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }),
  };
}

function buildSupabaseMock(params: {
  accountingInformalEntryId: string | null;
  persistError?: boolean;
  alreadyAuthorized?: boolean;
}) {
  const pendingPayloads: Record<string, unknown>[] = [];
  const authorizedPayloads: Record<string, unknown>[] = [];
  const errorPayloads: Record<string, unknown>[] = [];
  let salesOrdersCallCount = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== "sales_orders") {
        throw new Error(`Unexpected table in test: ${table}`);
      }

      salesOrdersCallCount += 1;

      if (salesOrdersCallCount === 1) {
        return createLoadSaleQuery(
          params.alreadyAuthorized
            ? buildAlreadyAuthorizedSaleSelectRow()
            : buildSaleSelectRow()
        );
      }

      if (salesOrdersCallCount === 2) {
        return createMarkPendingQuery(pendingPayloads, buildPendingRow());
      }

      if (params.persistError) {
        return createPersistErrorQuery(errorPayloads);
      }

      return createPersistAuthorizedQuery(
        authorizedPayloads,
        buildAuthorizedRow(params.accountingInformalEntryId)
      );
    }),
  };

  return {
    authorizedPayloads,
    errorPayloads,
    pendingPayloads,
    supabase,
  };
}

describe("emitSaleInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getCurrentUserOrganizationArcaAccess.mockResolvedValue({
      canManage: true,
      organization: {
        id: "org-1",
        cuit: "30-00000000-7",
      },
    });
    mocks.resolveArcaOrganizationCredentials.mockResolvedValue({
      cert: "cert-pem",
      key: "key-pem",
      certExpiresAt: null,
      environment: "dev",
      pointOfSale: 1,
      settings: {
        status: "connected",
        invoice_a_authorization_type: null,
      },
    });
    mocks.sendSaleInvoiceEmail.mockResolvedValue({ sent: false });
  });

  it("formaliza el asiento informal cuando el SDK autoriza la factura", async () => {
    const { authorizedPayloads, pendingPayloads, supabase } = buildSupabaseMock(
      {
        accountingInformalEntryId: "informal-entry-1",
      }
    );
    mocks.createClient.mockResolvedValue(supabase);
    mocks.createArcaClientFromCredentials.mockReturnValue({
      ElectronicBilling: {
        createNextVoucher: vi.fn().mockResolvedValue({
          CAE: "70417054367476",
          CAEFchVto: "2026-07-31",
          voucherNumber: 123,
        }),
        getVoucherInfo: vi.fn().mockResolvedValue({
          voucherNumber: 123,
          cae: "70417054367476",
          result: "A",
        }),
      },
    });

    const result = await emitSaleInvoice({
      orgSlug: "demo",
      saleId: "sale-1",
    });

    expect(result).toMatchObject({
      saleId: "sale-1",
      status: "authorized",
      invoiceNumber: "0001-00000123",
      cae: "70417054367476",
      pointOfSale: 1,
      voucherNumber: 123,
      voucherTypeCode: 6,
      idempotent: false,
    });
    expect(mocks.formalizarEntry).toHaveBeenCalledExactlyOnceWith(
      "informal-entry-1"
    );
    expect(pendingPayloads[0]).toMatchObject({
      arca_status: "pending",
      arca_last_error: null,
    });
    expect(authorizedPayloads[0]).toMatchObject({
      arca_status: "authorized",
      invoice_number: "0001-00000123",
      arca_cae: "70417054367476",
      arca_point_of_sale: 1,
      arca_voucher_number: 123,
      arca_voucher_type_code: 6,
    });
  });

  it("no formaliza nada si la venta autorizada no tiene asiento informal", async () => {
    const { supabase } = buildSupabaseMock({
      accountingInformalEntryId: null,
    });
    mocks.createClient.mockResolvedValue(supabase);
    mocks.createArcaClientFromCredentials.mockReturnValue({
      ElectronicBilling: {
        createNextVoucher: vi.fn().mockResolvedValue({
          CAE: "70417054367476",
          CAEFchVto: "2026-07-31",
          voucherNumber: 123,
        }),
        getVoucherInfo: vi.fn().mockResolvedValue({
          voucherNumber: 123,
        }),
      },
    });

    const result = await emitSaleInvoice({
      orgSlug: "demo",
      saleId: "sale-1",
    });

    expect(result.status).toBe("authorized");
    expect(mocks.formalizarEntry).not.toHaveBeenCalled();
  });

  it("devuelve resultado idempotente si la venta ya estaba autorizada", async () => {
    const { pendingPayloads, supabase } = buildSupabaseMock({
      accountingInformalEntryId: "informal-entry-1",
      alreadyAuthorized: true,
    });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await emitSaleInvoice({
      orgSlug: "demo",
      saleId: "sale-1",
    });

    expect(result).toMatchObject({
      saleId: "sale-1",
      status: "authorized",
      invoiceNumber: "0001-00000123",
      cae: "70417054367476",
      pointOfSale: 1,
      voucherNumber: 123,
      voucherTypeCode: 6,
      idempotent: true,
    });
    expect(mocks.createArcaClientFromCredentials).not.toHaveBeenCalled();
    expect(mocks.formalizarEntry).not.toHaveBeenCalled();
    expect(pendingPayloads).toHaveLength(0);
  });

  it("persiste el error fiscal cuando el SDK falla y no formaliza el asiento", async () => {
    const { errorPayloads, supabase } = buildSupabaseMock({
      accountingInformalEntryId: "informal-entry-1",
      persistError: true,
    });
    mocks.createClient.mockResolvedValue(supabase);
    mocks.createArcaClientFromCredentials.mockReturnValue({
      ElectronicBilling: {
        createNextVoucher: vi
          .fn()
          .mockRejectedValue(new Error("AFIP temporalmente no disponible")),
        getVoucherInfo: vi.fn(),
      },
    });

    await expect(
      emitSaleInvoice({
        orgSlug: "demo",
        saleId: "sale-1",
      })
    ).rejects.toThrow("AFIP temporalmente no disponible");

    expect(mocks.formalizarEntry).not.toHaveBeenCalled();
    expect(errorPayloads[0]).toMatchObject({
      arca_status: "error",
      arca_last_error: "AFIP temporalmente no disponible",
    });
  });
});
