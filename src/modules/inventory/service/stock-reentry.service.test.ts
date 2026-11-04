import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  isStockReentryFallbackRequired,
  STOCK_REENTRY_FALLBACK_CODE,
} from "../utils/stock-reentry";
import {
  applyStockReentries,
  undoStockReentries,
} from "./stock-reentry.service";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  allowed: vi.fn(),
  lookup: vi.fn(),
  active: true,
  lots: [{ id: "source-lot", warehouse_id: "original" }],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: mocks.from,
    auth: {
      getUser: async () => ({ data: { user: { id: "actor" } }, error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("./warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.allowed,
}));

describe("reingreso con consentimiento de depósito", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active = true;
    mocks.lots = [{ id: "source-lot", warehouse_id: "original" }];
    mocks.allowed.mockResolvedValue([
      { id: "original", is_default: false },
      { id: "principal", is_default: true },
    ]);
    mocks.rpc.mockResolvedValue({ data: ["inbound"], error: null });
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.lookup,
      in: vi
        .fn()
        .mockImplementation(async () => ({ data: mocks.lots, error: null })),
      single: vi.fn().mockImplementation(async () => ({
        data:
          table === "warehouses"
            ? { is_active: mocks.active }
            : { slug: "org" },
        error: null,
      })),
    }));
  });

  async function apply(allowDefaultFallback = false) {
    return applyStockReentries({
      supabase: await createClient(),
      orgId: "org-id",
      allowDefaultFallback,
      entries: [
        {
          sourceLotId: "source-lot",
          quantity: 0.3,
          unitQuantity: 0.1,
          operationKey: "return:line:lot",
          reason: "Devolución",
        },
      ],
    });
  }

  it("pide confirmación antes de cualquier RPC si el depósito está desactivado", async () => {
    mocks.active = false;
    await expect(apply()).rejects.toSatisfy(isStockReentryFallbackRequired);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("el consentimiento no reemplaza el lote de origen del payload", async () => {
    mocks.active = false;
    await expect(apply(true)).resolves.toEqual(["inbound"]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_stock_reentries",
      expect.objectContaining({
        p_actor_id: "actor",
        p_allow_default_fallback: true,
        p_entries: [
          expect.objectContaining({
            source_lot_id: "source-lot",
            quantity: 0.3,
            unit_quantity: 0.1,
          }),
        ],
      })
    );
  });

  it("no usa el principal por falta de acceso a un depósito que sigue activo", async () => {
    mocks.allowed.mockResolvedValue([{ id: "principal", is_default: true }]);
    await expect(apply(true)).rejects.toThrow("No tenés acceso");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("no inventa un origen si falta el lote original", async () => {
    mocks.lots = [];
    await expect(apply(true)).rejects.toThrow("lote original");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("conserva la señal de confirmación si el depósito se desactiva después del preflight", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "Depósito desactivado",
        details: STOCK_REENTRY_FALLBACK_CODE,
      },
    });
    await expect(apply()).rejects.toSatisfy(isStockReentryFallbackRequired);
  });

  it("compensa por IDs, sin restaurar un snapshot del saldo", async () => {
    await undoStockReentries({
      supabase: await createClient(),
      orgId: "org-id",
      movementIds: ["inbound"],
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("undo_stock_reentries", {
      p_org_id: "org-id",
      p_actor_id: "actor",
      p_movement_ids: ["inbound"],
    });
  });

  it("reutiliza una generación determinista después de una compensación", async () => {
    mocks.lookup.mockResolvedValueOnce({
      data: { id: "compensated", reentry_reversed_at: "2026-10-01T12:00:00Z" },
      error: null,
    });
    await apply();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_stock_reentries",
      expect.objectContaining({
        p_entries: [
          expect.objectContaining({
            operation_key: "return:line:lot:compensated",
          }),
        ],
      })
    );
  });
});
