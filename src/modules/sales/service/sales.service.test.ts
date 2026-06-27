import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";

const mocks = vi.hoisted(() => ({
  asentarInformalEntry: vi.fn(),
  cancelInformalEntry: vi.fn(),
  createClient: vi.fn(),
  formalizarEntry: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  getProductTaxAssignments: vi.fn(),
  isAccountingIntegrationEnabled: vi.fn(),
}));

vi.mock("@/lib/accounting-server", () => ({
  asentarInformalEntry: mocks.asentarInformalEntry,
  cancelInformalEntry: mocks.cancelInformalEntry,
  formalizarEntry: mocks.formalizarEntry,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isAccountingIntegrationEnabled: mocks.isAccountingIntegrationEnabled,
}));

vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));

vi.mock("@/modules/organizations/service/members.service", () => ({
  getOrganizationMembersWithUsersAdmin: vi.fn(),
}));

vi.mock("@/modules/taxes/product-tax.service", () => ({
  getProductTaxAssignments: mocks.getProductTaxAssignments,
}));

import { confirmSaleOrder } from "./sales.service";

type InvoiceType = Database["public"]["Enums"]["invoice_type"];

type MockSale = {
  invoiceNumber: string | null;
  invoiceType: InvoiceType | null;
};

function createEqChain(result: unknown, levels = 2) {
  if (levels <= 0) {
    return result;
  }

  return {
    eq: vi.fn(() => createEqChain(result, levels - 1)),
  };
}

function createMaybeSingleChain(result: unknown, levels = 2) {
  if (levels <= 0) {
    return {
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
  }

  return {
    eq: vi.fn(() => createMaybeSingleChain(result, levels - 1)),
  };
}

function createSelectMaybeSingleResult(data: unknown) {
  return {
    select: vi.fn(() => createMaybeSingleChain({ data, error: null })),
  };
}

function createDeleteResult() {
  return {
    delete: vi.fn(() => createEqChain({ error: null })),
  };
}

function createSalesOrderUpdateResult(updatedSalesOrders: unknown[]) {
  return {
    select: vi.fn(() =>
      createMaybeSingleChain({
        data: {
          id: "sale-1",
          status: "DRAFT",
          credit_days: null,
          invoice_type: null,
          expiration_date: null,
          sale_number: 12,
          invoice_number: null,
          user_id: "seller-1",
          tipo_factura: "MANUAL",
        },
        error: null,
      })
    ),
    update: vi.fn((payload: unknown) => {
      updatedSalesOrders.push(payload);
      return createEqChain({ error: null });
    }),
  };
}

function createSalesOrderItemsResult(upsertedItems: unknown[]) {
  return {
    upsert: vi.fn((payload: unknown) => {
      upsertedItems.push(payload);
      return { error: null };
    }),
  };
}

function buildSupabaseMock(params: MockSale) {
  const updatedSalesOrders: unknown[] = [];
  const upsertedItems: unknown[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "seller-1",
            email: "seller@example.com",
            user_metadata: { full_name: "Seller" },
          },
        },
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: ["sales.manage.all"],
      error: null,
    }),
    from: vi.fn((table: string) => {
      if (table === "sales_orders") {
        return createSalesOrderUpdateResult(updatedSalesOrders);
      }

      if (table === "customers") {
        return createSelectMaybeSingleResult({
          business_name: "Cliente SA",
          fantasy_name: null,
        });
      }

      if (table === "sales_order_items") {
        return createSalesOrderItemsResult(upsertedItems);
      }

      if (table === "sales_order_item_taxes" || table === "sales_order_taxes") {
        return createDeleteResult();
      }

      throw new Error(`Unexpected table in test: ${table}`);
    }),
  };

  const salesOrderQuery = createSalesOrderUpdateResult(updatedSalesOrders);
  salesOrderQuery.select.mockReturnValue(
    createMaybeSingleChain({
      data: {
        id: "sale-1",
        status: "DRAFT",
        credit_days: null,
        invoice_type: params.invoiceType,
        expiration_date: null,
        sale_number: 12,
        invoice_number: params.invoiceNumber,
        user_id: "seller-1",
        tipo_factura: "MANUAL",
      },
      error: null,
    })
  );

  supabase.from.mockImplementation((table: string) => {
    if (table === "sales_orders") {
      return salesOrderQuery;
    }

    if (table === "customers") {
      return createSelectMaybeSingleResult({
        business_name: "Cliente SA",
        fantasy_name: null,
      });
    }

    if (table === "sales_order_items") {
      return createSalesOrderItemsResult(upsertedItems);
    }

    if (table === "sales_order_item_taxes" || table === "sales_order_taxes") {
      return createDeleteResult();
    }

    throw new Error(`Unexpected table in test: ${table}`);
  });

  return { supabase, updatedSalesOrders, upsertedItems };
}

function buildConfirmInput(params: {
  invoiceNumber: string | null;
  invoiceType: InvoiceType;
}) {
  return {
    orgSlug: "demo",
    saleId: "sale-1",
    customerId: "customer-1",
    sellerId: "seller-1",
    saleDate: "2026-06-27",
    invoiceType: params.invoiceType,
    invoiceNumber: params.invoiceNumber,
    accountingInformalEntryId: "informal-entry-1",
    items: [
      {
        id: "item-1",
        type: "adjustment" as const,
        description: "Servicio gravado",
        quantity: 1,
        unitPrice: 100,
        basePrice: 100,
        accountingConceptCode: "SERVICIOS_GRAVADOS",
        accountingAccountCode: "OTROS_INGRESOS",
        taxes: [],
      },
    ],
    taxes: [],
  };
}

describe("confirmSaleOrder accounting informal entry integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formalizarEntry.mockResolvedValue("journal-entry-1");
    mocks.asentarInformalEntry.mockResolvedValue(undefined);
    mocks.cancelInformalEntry.mockResolvedValue(undefined);
    mocks.getOrganizationBySlug.mockResolvedValue({ id: "org-1" });
    mocks.getProductTaxAssignments.mockResolvedValue(new Map());
    mocks.isAccountingIntegrationEnabled.mockResolvedValue(true);
  });

  it("formaliza el asiento informal cuando se confirma una factura con numero", async () => {
    const { supabase, updatedSalesOrders } = buildSupabaseMock({
      invoiceNumber: null,
      invoiceType: null,
    });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await confirmSaleOrder(
      buildConfirmInput({
        invoiceType: "FACTURA_B",
        invoiceNumber: "0001-00000001",
      })
    );

    expect(result).toEqual({
      status: "CONFIRMED",
      saleId: "sale-1",
      totalAmount: 100,
    });
    expect(mocks.formalizarEntry).toHaveBeenCalledExactlyOnceWith(
      "informal-entry-1"
    );
    expect(mocks.asentarInformalEntry).not.toHaveBeenCalled();
    expect(mocks.cancelInformalEntry).not.toHaveBeenCalled();
    expect(updatedSalesOrders[0]).toMatchObject({
      accounting_informal_entry_id: "informal-entry-1",
      invoice_number: "0001-00000001",
      invoice_type: "FACTURA_B",
      status: "CONFIRMED",
    });
  });

  it("marca como asentado el asiento informal cuando se confirma una nota de venta", async () => {
    const { supabase } = buildSupabaseMock({
      invoiceNumber: null,
      invoiceType: null,
    });
    mocks.createClient.mockResolvedValue(supabase);

    await confirmSaleOrder(
      buildConfirmInput({
        invoiceType: "NOTA_DE_VENTA",
        invoiceNumber: null,
      })
    );

    expect(mocks.asentarInformalEntry).toHaveBeenCalledExactlyOnceWith(
      "informal-entry-1"
    );
    expect(mocks.formalizarEntry).not.toHaveBeenCalled();
    expect(mocks.cancelInformalEntry).not.toHaveBeenCalled();
  });
});
