import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareOrderRemittancesAction } from "./prepare-order-remittances.action";

const mocks = vi.hoisted(() => ({
  orders: vi.fn(),
  parent: vi.fn(),
  children: vi.fn(),
  access: vi.fn(),
  rows: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock(
  "@/modules/organizations/actions/get-organization-settings.action",
  () => ({
    getOrganizationSettings: async () => ({
      success: true,
      data: {
        remittance_mask_printing_enabled: true,
        dispatch_declared_value_percentage: 70,
      },
    }),
  })
);
vi.mock(
  "@/modules/organizations/actions/get-remittance-settings.action",
  () => ({
    getRemittanceSettings: async () => ({
      success: true,
      data: { autoEnabled: true },
    }),
  })
);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: mocks.orders,
        single: mocks.parent,
        limit: mocks.children,
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../service/orders.service", () => ({
  resolveOrdersAccessContext: mocks.access,
}));
vi.mock("../server/order-remittance-pdf-document.service", () => ({
  fetchOrderRemittanceRows: mocks.rows,
  getOrderRemittanceData: async () => ({
    carrierName: null,
    remittance: {
      type: "REMITO_FINAL",
      date: "2026-11-20",
      issuer: { businessName: "Emisor" },
      customer: { businessName: "Cliente" },
      seller: { name: "Vendedor" },
      taxesTotal: 0,
    },
  }),
}));

const root = "00000000-0000-4000-8000-000000000001";
const child = "00000000-0000-4000-8000-000000000002";
const secondChild = "00000000-0000-4000-8000-000000000003";
const rootOrder = {
  id: root,
  parent_order_id: null,
  quote_id: "quote",
  status: "PREPARING",
  created_by: "actor",
};
function row(index: number, assignedOrderId: string | null = null) {
  return {
    source: {
      id: `item-${index}`,
      quote_id: "quote",
      assigned_order_id: assignedOrderId,
      product_id: `product-${index}`,
      product_variant_id: null,
    },
    commercialQuantity: null,
    item: {
      sku: `SKU-${index}`,
      name: `Producto ${index}`,
      quantity: 1,
      unitOfMeasure: "UN",
      unitPrice: 10,
      subtotal: 10,
    },
  };
}

describe("prepareOrderRemittancesAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.orders.mockResolvedValue({ data: [rootOrder], error: null });
    mocks.parent.mockResolvedValue({ data: rootOrder, error: null });
    mocks.children.mockResolvedValue({ data: [], error: null });
    mocks.access.mockResolvedValue({ scope: "all", userId: "actor" });
    mocks.rows.mockResolvedValue([row(1)]);
    mocks.rpc.mockResolvedValue({ data: "a".repeat(32), error: null });
  });

  it("prepares 100 unassigned root items as 26/26/26/22 without changing assignments", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => row(index));
    mocks.rows.mockResolvedValue(rows);
    const result = await prepareOrderRemittancesAction({
      orgSlug: "org",
      childOrderIds: [root],
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.data.parentOrderId).toBe(root);
    expect(
      result.data.documents.map((document) => document.lines.length)
    ).toEqual([26, 26, 26, 22]);
    const sources = result.data.documents.flatMap((document) =>
      document.lines.flatMap((line) => line.sources)
    );
    expect(new Set(sources.map((source) => source.quote_item_id)).size).toBe(
      100
    );
    expect(sources.every((source) => source.order_id === root)).toBe(true);
    expect(rows.every(({ source }) => source.assigned_order_id === null)).toBe(
      true
    );
    expect(mocks.rows).toHaveBeenCalledWith(
      expect.anything(),
      "org",
      [root],
      "quote"
    );
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "order_remittance_source_fingerprint",
      "order_remittance_source_fingerprint",
    ]);
  });

  it("includes both explicitly assigned and unassigned standalone items", async () => {
    mocks.rows.mockResolvedValue([row(1), row(2, root)]);
    const result = await prepareOrderRemittancesAction({
      orgSlug: "org",
      childOrderIds: [root],
    });
    expect(result.success && result.data.documents[0].lines).toHaveLength(2);
  });

  it("preserves multiple children of the same parent without loading loose items", async () => {
    mocks.orders.mockResolvedValue({
      data: [child, secondChild].map((id) => ({
        ...rootOrder,
        id,
        parent_order_id: root,
      })),
      error: null,
    });
    mocks.rows.mockResolvedValue([row(1, child), row(2, secondChild)]);
    const result = await prepareOrderRemittancesAction({
      orgSlug: "org",
      childOrderIds: [child, secondChild],
    });
    expect(result.success).toBe(true);
    expect(mocks.rows).toHaveBeenCalledWith(
      expect.anything(),
      "org",
      [child, secondChild],
      undefined
    );
    expect(mocks.children).not.toHaveBeenCalled();
  });

  it("rejects a root with children before reading its items", async () => {
    mocks.children.mockResolvedValue({ data: [{ id: child }], error: null });
    const result = await prepareOrderRemittancesAction({
      orgSlug: "org",
      childOrderIds: [root],
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("tiene subpedidos"),
    });
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it("rejects multiple roots and children from different parents", async () => {
    for (const parents of [
      [null, null],
      [root, child],
    ]) {
      mocks.orders.mockResolvedValue({
        data: parents.map((parentId, index) => ({
          ...rootOrder,
          id: index === 0 ? child : secondChild,
          parent_order_id: parentId,
        })),
        error: null,
      });
      expect(
        (
          await prepareOrderRemittancesAction({
            orgSlug: "org",
            childOrderIds: [child, secondChild],
          })
        ).success
      ).toBe(false);
    }
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it("rejects loose items for children, foreign quote items, and empty orders", async () => {
    mocks.orders.mockResolvedValue({
      data: [{ ...rootOrder, id: child, parent_order_id: root }],
      error: null,
    });
    expect(
      (
        await prepareOrderRemittancesAction({
          orgSlug: "org",
          childOrderIds: [child],
        })
      ).success
    ).toBe(false);
    mocks.orders.mockResolvedValue({ data: [rootOrder], error: null });
    mocks.rows.mockResolvedValue([
      { ...row(1), source: { ...row(1).source, quote_id: "foreign" } },
    ]);
    expect(
      (
        await prepareOrderRemittancesAction({
          orgSlug: "org",
          childOrderIds: [root],
        })
      ).success
    ).toBe(false);
    mocks.rows.mockResolvedValue([]);
    expect(
      (
        await prepareOrderRemittancesAction({
          orgSlug: "org",
          childOrderIds: [root],
        })
      ).success
    ).toBe(false);
  });

  it("rejects inaccessible or non-preparing roots and changed source fingerprints", async () => {
    mocks.access.mockResolvedValue({ scope: "own", userId: "another-actor" });
    expect(
      (
        await prepareOrderRemittancesAction({
          orgSlug: "org",
          childOrderIds: [root],
        })
      ).success
    ).toBe(false);
    mocks.access.mockResolvedValue({ scope: "all", userId: "actor" });
    mocks.orders.mockResolvedValueOnce({
      data: [{ ...rootOrder, status: "DISPATCHED" }],
      error: null,
    });
    expect(
      (
        await prepareOrderRemittancesAction({
          orgSlug: "org",
          childOrderIds: [root],
        })
      ).success
    ).toBe(false);
    mocks.rpc
      .mockResolvedValueOnce({ data: "a".repeat(32), error: null })
      .mockResolvedValueOnce({ data: "b".repeat(32), error: null });
    expect(
      await prepareOrderRemittancesAction({
        orgSlug: "org",
        childOrderIds: [root],
      })
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("cambió durante"),
    });
  });
});
