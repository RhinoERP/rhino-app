import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAtomicPurchaseReceipt,
  type ReceiptLine,
} from "./purchase-receipts.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org-a" }),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));

const line: ReceiptLine = {
  itemId: "item-a",
  productId: "product-a",
  quantity: 2,
  unitQuantity: 3.5,
  unitCost: 10,
  variantStocks: {},
  lots: [
    {
      lotNumber: "LOT-1",
      expirationDate: "2027-01-01",
      quantity: 2,
      unitQuantity: 3.5,
    },
  ],
};
const input = {
  orgSlug: "org-a",
  purchaseOrderId: "purchase-a",
  receiptId: "receipt-a",
  warehouseId: "branch",
  actorId: "user-a",
  closePurchase: false,
  fiscal: null,
  lines: [line],
};

describe("RPC de recepción por depósito", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("envía depósito, identidad y ambas cantidades a la RPC nueva", async () => {
    await expect(applyAtomicPurchaseReceipt(input)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_warehouse_purchase_receipt",
      expect.objectContaining({
        p_warehouse_id: "branch",
        p_receipt_id: "receipt-a",
        p_org_id: "org-a",
        p_items: [
          expect.objectContaining({
            quantity: 2,
            unit_quantity: 3.5,
            actor_id: "user-a",
            lots: line.lots,
          }),
        ],
      })
    );
  });

  it("conserva false como resultado de un reintento ya confirmado", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(applyAtomicPurchaseReceipt(input)).resolves.toBe(false);
  });

  it("propaga el rechazo de depósito o de fingerprint de la transacción", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Depósito diferente" },
    });
    await expect(applyAtomicPurchaseReceipt(input)).rejects.toThrow(
      "Depósito diferente"
    );
  });

  it("serializa campos fiscales opcionales sin alterar el cierre", async () => {
    await applyAtomicPurchaseReceipt({
      ...input,
      closePurchase: true,
      fiscal: {
        mode: "receipt",
        optional: undefined,
        items: [{ variant_stocks: null }],
      },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_warehouse_purchase_receipt",
      expect.objectContaining({
        p_close: true,
        p_fiscal: { mode: "receipt", items: [{ variant_stocks: null }] },
      })
    );
  });
});
