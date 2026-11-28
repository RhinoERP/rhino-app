import { beforeEach, expect, it, vi } from "vitest";
import { updatePurchaseOrder } from "./purchases.service";

const state = vi.hoisted(() => ({ from: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: state.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("@/modules/inventory/service/transaction-units.service", () => ({
  getTransactionProductUnits: async () =>
    new Map([["product", { unit_of_measure: "UN", units_per_box: null }]]),
  assertCaseQuantity: vi.fn(),
}));
vi.mock("./purchase-variant-validation.service", () => ({
  assertPurchaseVariantAllocations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./purchase-tax-snapshots.service", async (original) => ({
  ...(await original<object>()),
  getPurchaseItemTaxRows: async () => [],
  resolvePurchaseTaxSelections: async () => ({
    fallbackTaxes: [],
    lineTaxes: [[]],
  }),
  buildPurchaseTaxPlan: async () => ({
    itemTaxes: [],
    aggregateTaxes: [],
    lineBases: new Map(),
    totalTaxAmount: 0,
  }),
  persistPurchaseFiscalState: state.persist,
}));
const order = {
  id: "order",
  status: "ORDERED",
  tax_snapshot_initialized: true,
  fallback_taxes: [],
  global_discount_percentage: 0,
  supplier_id: "supplier",
  purchase_date: "2026-11-27",
  expiration_date: null,
  remittance_number: null,
};
const saved = {
  id: "line",
  product_id: "product",
  quantity: 1,
  unit_quantity: 1,
  unit_cost: 90,
  subtotal: 90,
  list_unit_cost: 100,
  discount_1_percentage: 10,
  post_invoice_volume_discount_percentage: 5,
  post_invoice_discounts_include_taxes: true,
  variant_stocks: null,
};
beforeEach(() => {
  state.persist.mockReset().mockResolvedValue(order);
  useSavedRow(saved, false);
});

function useSavedRow(row: Record<string, unknown>, enabled: boolean) {
  state.from.mockImplementation((table: string) => {
    const data: Record<string, unknown> = {
      purchase_orders: order,
      purchase_order_items: [row],
      organization_settings: {
        settings: { purchase_discounts_enabled: enabled },
      },
    };
    const result = { data: data[table], error: null };
    const query = Object.assign(Promise.resolve(result), {
      select: () => query,
      eq: () => query,
      single: async () => result,
      maybeSingle: async () => result,
    });
    return query;
  });
}
it("editar una compra existente con la función apagada conserva identidad, descuentos y total fiscal", async () => {
  await updatePurchaseOrder({
    orgSlug: "test",
    purchaseOrderId: "order",
    remittance_number: "R-2",
    items: [
      {
        id: "line",
        product_id: "product",
        quantity: 2,
        unit_quantity: 2,
        unit_cost: 90,
        subtotal: 180,
      },
    ],
  });
  expect(state.persist).toHaveBeenCalledOnce();
  expect(state.persist).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "replace",
      subtotal: 180,
      remittanceNumber: "R-2",
      items: [
        expect.objectContaining({
          id: "line",
          unit_cost: 90,
          subtotal: 180,
          list_unit_cost: 100,
          discount_1_percentage: 10,
          post_invoice_volume_discount_percentage: 5,
          post_invoice_discounts_include_taxes: true,
        }),
      ],
    })
  );
});

it("quitar el último descuento post factura persiste el cero en lugar de restaurar el valor previo", async () => {
  useSavedRow(
    {
      ...saved,
      list_unit_cost: null,
      discount_1_percentage: 0,
      post_invoice_volume_discount_percentage: 5,
      post_invoice_discounts_include_taxes: false,
    },
    true
  );
  await updatePurchaseOrder({
    orgSlug: "test",
    purchaseOrderId: "order",
    items: [
      {
        id: "line",
        product_id: "product",
        quantity: 1,
        unit_quantity: 1,
        unit_cost: 100,
        subtotal: 100,
        list_unit_cost: null,
        discount_1_percentage: 0,
        post_invoice_volume_discount_percentage: 0,
        post_invoice_discounts_include_taxes: false,
      },
    ],
  });
  expect(state.persist).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [
        expect.objectContaining({
          id: "line",
          list_unit_cost: null,
          post_invoice_volume_discount_percentage: 0,
        }),
      ],
    })
  );
});
