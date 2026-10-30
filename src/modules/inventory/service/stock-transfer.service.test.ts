import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStockTransferForOrg,
  createStockTransferSchema,
} from "./stock-transfer.service";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  requireAuth: vi.fn(),
  getOrganizationBySlug: vi.fn(),
  assertWarehouseAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.getOrganizationBySlug,
}));
vi.mock("./warehouse-stock.service", () => ({
  assertWarehouseAccess: mocks.assertWarehouseAccess,
}));

const orgA = "org-a";
const sourceWarehouse = "11111111-1111-4111-8111-111111111111";
const destinationWarehouse = "22222222-2222-4222-8222-222222222222";
const lotA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const lotB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const productB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type QueryResult = { data: unknown; error: { message: string } | null };

function chain(result: QueryResult) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const validInput = {
  orgSlug: orgA,
  sourceWarehouseId: sourceWarehouse,
  destinationWarehouseId: destinationWarehouse,
  reason: "Reposición",
  items: [{ sourceLotId: lotA, quantity: 2 }],
};

const unitProduct = {
  id: productA,
  unit_of_measure: "UNIT",
  tracks_stock_units: false,
};
const unitLot = {
  id: lotA,
  product_id: productA,
  quantity_available: 10,
  unit_quantity_available: null,
};

describe("transferencias de stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      supabase: { from: mocks.from },
      userId: "user-a",
    });
    mocks.getOrganizationBySlug.mockResolvedValue({ id: "org-a" });
    mocks.assertWarehouseAccess.mockResolvedValue({});
    mocks.rpc.mockResolvedValue({ data: "transfer-1", error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "product_lots") {
        return chain({ data: [unitLot], error: null });
      }
      if (table === "products") {
        return chain({ data: [unitProduct], error: null });
      }
      return chain({ data: [], error: null });
    });
  });

  it("registra la transferencia con montos y actor correctos", async () => {
    const transferId = await createStockTransferForOrg(validInput);

    expect(transferId).toBe("transfer-1");
    expect(mocks.assertWarehouseAccess).toHaveBeenNthCalledWith(
      1,
      orgA,
      sourceWarehouse,
      { requireActive: false }
    );
    expect(mocks.assertWarehouseAccess).toHaveBeenNthCalledWith(
      2,
      orgA,
      destinationWarehouse,
      { requireActive: true }
    );
    expect(mocks.rpc).toHaveBeenCalledWith("create_stock_transfer", {
      p_organization_id: "org-a",
      p_source_warehouse_id: sourceWarehouse,
      p_destination_warehouse_id: destinationWarehouse,
      p_items: [{ source_lot_id: lotA, quantity: 2, unit_quantity: 0 }],
      p_reason: "Reposición",
      p_actor_id: "user-a",
    });
  });

  it("rechaza el mismo depósito como origen y destino", () => {
    const result = createStockTransferSchema.safeParse({
      ...validInput,
      destinationWarehouseId: sourceWarehouse,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza lotes duplicados en la misma transferencia", () => {
    const result = createStockTransferSchema.safeParse({
      ...validInput,
      items: [
        { sourceLotId: lotA, quantity: 1 },
        { sourceLotId: lotA, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("falla si el lote no pertenece al depósito de origen", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "product_lots") {
        return chain({ data: [], error: null });
      }
      return chain({ data: [unitProduct], error: null });
    });

    await expect(createStockTransferForOrg(validInput)).rejects.toThrow(
      "El lote seleccionado no pertenece al depósito de origen"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("falla si el producto del lote no existe en la organización", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "product_lots") {
        return chain({ data: [unitLot], error: null });
      }
      return chain({ data: [], error: null });
    });

    await expect(createStockTransferForOrg(validInput)).rejects.toThrow(
      "Producto del lote no encontrado en la organización"
    );
  });

  it("rechaza cantidades mayores al stock disponible", async () => {
    await expect(
      createStockTransferForOrg({
        ...validInput,
        items: [{ sourceLotId: lotA, quantity: 11 }],
      })
    ).rejects.toThrow("Stock insuficiente del lote seleccionado");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exige piezas y las envía para productos KG con control de unidades", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "product_lots") {
        return chain({
          data: [{ ...unitLot, unit_quantity_available: 5 }],
          error: null,
        });
      }
      return chain({
        data: [
          {
            ...unitProduct,
            unit_of_measure: "KG",
            tracks_stock_units: true,
          },
        ],
        error: null,
      });
    });

    await expect(
      createStockTransferForOrg({
        ...validInput,
        items: [{ sourceLotId: lotA, quantity: 1.5, unitQuantity: 0 }],
      })
    ).rejects.toThrow("Ingresá la cantidad de piezas a transferir");

    await expect(
      createStockTransferForOrg({
        ...validInput,
        items: [{ sourceLotId: lotA, quantity: 1.5, unitQuantity: 6 }],
      })
    ).rejects.toThrow("Unidades insuficientes del lote seleccionado");

    await createStockTransferForOrg({
      ...validInput,
      items: [{ sourceLotId: lotA, quantity: 1.5, unitQuantity: 5 }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_stock_transfer",
      expect.objectContaining({
        p_items: [{ source_lot_id: lotA, quantity: 1.5, unit_quantity: 5 }],
      })
    );
  });

  it("rechaza piezas para productos que no las registran", async () => {
    await expect(
      createStockTransferForOrg({
        ...validInput,
        items: [{ sourceLotId: lotA, quantity: 1, unitQuantity: 1 }],
      })
    ).rejects.toThrow("El producto no registra piezas por separado");
  });

  it("valida productos y lotes solo de la organización y depósito de origen", async () => {
    await createStockTransferForOrg(validInput);

    const lotsChain = mocks.from.mock.results[0]?.value;
    expect(lotsChain.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(lotsChain.eq).toHaveBeenCalledWith("warehouse_id", sourceWarehouse);
    expect(lotsChain.in).toHaveBeenCalledWith("id", [lotA]);
  });

  it("propaga el error de la RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "stock insuficiente" },
    });

    await expect(createStockTransferForOrg(validInput)).rejects.toThrow(
      "stock insuficiente"
    );
  });

  it("combina múltiples lotes en una sola llamada", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "product_lots") {
        return chain({
          data: [
            unitLot,
            {
              id: lotB,
              product_id: productB,
              quantity_available: 4,
              unit_quantity_available: null,
            },
          ],
          error: null,
        });
      }
      return chain({
        data: [unitProduct, { ...unitProduct, id: productB }],
        error: null,
      });
    });

    await createStockTransferForOrg({
      ...validInput,
      items: [
        { sourceLotId: lotA, quantity: 2 },
        { sourceLotId: lotB, quantity: 3 },
      ],
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_stock_transfer",
      expect.objectContaining({
        p_items: [
          { source_lot_id: lotA, quantity: 2, unit_quantity: 0 },
          { source_lot_id: lotB, quantity: 3, unit_quantity: 0 },
        ],
      })
    );
  });
});
