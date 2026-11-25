import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { restoreOriginalOrderStock } from "./order-stock-reentry.service";

const mocks = vi.hoisted(() => ({ from: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mocks.from }),
}));
vi.mock("@/modules/inventory/service/stock-reentry.service", () => ({
  applyStockReentries: mocks.apply,
}));

function query(data: unknown) {
  const result = { data, error: null };
  return Object.assign(Promise.resolve(result), {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  });
}

describe("reingreso de pedidos desde salidas reales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apply.mockResolvedValue([]);
  });

  function setup(prior: unknown[], lots: unknown[]) {
    mocks.from
      .mockReturnValueOnce(
        query([
          {
            id: "item",
            quote_id: "quote",
            assigned_order_id: "child",
            product_id: "product",
            product_variant_id: null,
            quantity: 4,
          },
        ])
      )
      .mockReturnValueOnce(
        query([
          {
            id: "child",
            parent_order_id: "parent",
            quote_id: "quote",
            order_number: "ORD-CHILD",
            sales_order_id: null,
          },
        ])
      )
      .mockReturnValueOnce(
        query([
          {
            id: "outgoing",
            lot_id: "consumed",
            quantity: 4,
            unit_quantity: -2,
          },
        ])
      )
      .mockReturnValueOnce(query(prior))
      .mockReturnValueOnce(query(lots));
  }

  async function restore(allowDefaultFallback = false) {
    await restoreOriginalOrderStock({
      supabase: await createClient(),
      orgId: "org",
      quoteItemIds: ["item"],
      reason: "Reversión de sub-pedido",
      allowDefaultFallback,
    });
  }

  it("usa el lote consumido y ambas cantidades, aunque haya otro lote primero", async () => {
    setup(
      [],
      [
        {
          id: "unrelated-first",
          product_id: "product",
          product_variant_id: null,
        },
        { id: "consumed", product_id: "product", product_variant_id: null },
      ]
    );
    await restore(true);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        allowDefaultFallback: true,
        entries: [
          expect.objectContaining({
            sourceLotId: "consumed",
            quantity: 4,
            unitQuantity: 2,
          }),
        ],
      })
    );
  });

  it("un reintento no agrega stock si ya fue restituido en el principal", async () => {
    setup(
      [
        {
          reentry_key: "order-reentry:child:outgoing:item:consumed",
          reentry_source_lot_id: "consumed",
          quantity: 4,
          unit_quantity: 2,
        },
      ],
      [{ id: "consumed", product_id: "product", product_variant_id: null }]
    );
    await restore(true);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [] })
    );
  });

  it("rechaza un origen faltante en vez de elegir otro lote del producto", async () => {
    setup(
      [],
      [{ id: "unrelated", product_id: "product", product_variant_id: null }]
    );
    await expect(restore()).rejects.toThrow("lotes originales");
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
