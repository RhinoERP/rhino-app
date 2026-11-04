import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyWarehouseStockMovement,
  resolveInventoryWarehouseId,
  setVariantWarehouseStock,
  setWarehouseStockBalance,
} from "./stock-maintenance.service";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  warehouses: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org-a" }),
}));
vi.mock("./warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.warehouses,
}));

const warehouseId = "11111111-1111-4111-8111-111111111111";
const otherWarehouseId = "22222222-2222-4222-8222-222222222222";
function query(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("mantenimiento de stock por depósito", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "movement-a", error: null });
    mocks.from.mockReturnValue(query({ warehouse_id: warehouseId }));
    mocks.warehouses.mockResolvedValue([
      { id: warehouseId, name: "Principal" },
    ]);
  });

  it("valida que el depósito siga asignado sin cambiarlo por el principal", async () => {
    await expect(resolveInventoryWarehouseId("org-a")).resolves.toBe(
      warehouseId
    );
    await expect(
      resolveInventoryWarehouseId("org-a", otherWarehouseId)
    ).rejects.toThrow("habilitado");
  });

  it("rechaza un lote de otro depósito antes de invocar la RPC", async () => {
    await expect(
      applyWarehouseStockMovement({
        orgSlug: "org-a",
        warehouseId: otherWarehouseId,
        productId: "product-a",
        lotId: "lot-a",
        type: "OUTBOUND",
        quantity: 1,
      })
    ).rejects.toThrow("no pertenece");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envía ajuste medido y piezas firmados a una única transacción", async () => {
    await applyWarehouseStockMovement({
      orgSlug: "org-a",
      warehouseId,
      productId: "product-a",
      lotId: "lot-a",
      type: "ADJUSTMENT",
      quantity: -1.5,
      unitQuantity: -2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_warehouse_stock_movement",
      expect.objectContaining({
        p_warehouse_id: warehouseId,
        p_org_id: "org-a",
        p_quantity: -1.5,
        p_unit_quantity: -2,
      })
    );
  });

  it("el saldo absoluto conserva la identidad completa y no calcula un delta en JS", async () => {
    await setWarehouseStockBalance({
      orgSlug: "org-a",
      warehouseId,
      productId: "product-a",
      productVariantId: "variant-a",
      lotId: "lot-a",
      lotNumber: "DEFAULT",
      expirationDate: null,
      quantity: 8,
      reason: "Importación",
      source: "IMPORT",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "set_warehouse_stock_balance",
      expect.objectContaining({
        p_product_variant_id: "variant-a",
        p_lot_id: "lot-a",
        p_warehouse_id: warehouseId,
        p_quantity: 8,
        p_expiration_date: undefined,
      })
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rechaza saldos de variante con varios lotes en vez de modificar uno arbitrario", async () => {
    mocks.from
      .mockReturnValueOnce(query({ product_id: "product-a" }))
      .mockReturnValueOnce(query([{ id: "lot-a" }, { id: "lot-b" }]));
    await expect(
      setVariantWarehouseStock({
        orgSlug: "org-a",
        warehouseId,
        variantId: "variant-a",
        quantity: 8,
      })
    ).rejects.toThrow("varios lotes");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("propaga el rechazo de saldo insuficiente de la RPC", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Stock insuficiente" },
    });
    await expect(
      applyWarehouseStockMovement({
        orgSlug: "org-a",
        warehouseId,
        productId: "product-a",
        lotId: "lot-a",
        type: "OUTBOUND",
        quantity: 5,
      })
    ).rejects.toThrow("Stock insuficiente");
  });

  it("crea el saldo inicial de una variante en el depósito elegido sin recurrir a su lot_id global", async () => {
    const balances = query([]);
    mocks.from
      .mockReturnValueOnce(query({ product_id: "product-a" }))
      .mockReturnValueOnce(balances);
    await setVariantWarehouseStock({
      orgSlug: "org-a",
      warehouseId: otherWarehouseId,
      variantId: "variant-a",
      quantity: 8,
    });
    expect(balances.eq).toHaveBeenCalledWith("warehouse_id", otherWarehouseId);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "set_warehouse_stock_balance",
      expect.objectContaining({
        p_warehouse_id: otherWarehouseId,
        p_product_variant_id: "variant-a",
        p_lot_number: "DEFAULT",
        p_lot_id: undefined,
        p_quantity: 8,
      })
    );
  });
});
