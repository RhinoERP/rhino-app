import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMeliPhysicalReturn,
  getMeliPhysicalReturnDetail,
  getMeliPhysicalReturnForm,
  listMeliPhysicalReturns,
} from "./meli-physical-return.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  auth: vi.fn(),
  sale: vi.fn(),
  warehouses: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("./meli-read.service", () => ({ getMeliSale: mocks.sale }));
vi.mock("@/modules/inventory/service/warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.warehouses,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));

const saleId = "00000000-0000-4000-8000-000000000001";
const movementId = "00000000-0000-4000-8000-000000000002";
const returnId = "00000000-0000-4000-8000-000000000003";
const input = {
  saleId,
  idempotencyKey: "00000000-0000-4000-8000-000000000004",
  returnDate: "2026-11-17",
  reason: "Mercadería recibida en depósito",
  items: [{ sourceMovementId: movementId, quantity: 0.3, restock: true }],
};
let received: {
  source_movement_id: string;
  quantity: number;
  unit_quantity: number;
}[];
let productUnit: string;

function installReaders() {
  mocks.from.mockImplementation((table: string) => {
    const query = Object.assign(
      Promise.resolve({
        data: [
          {
            id: "product",
            unit_of_measure: productUnit,
            tracks_stock_units: false,
          },
        ],
        error: null,
      }),
      {
        select: () => query,
        order: () => query,
        in: () => query,
        eq: (key: string, value: unknown) => {
          mocks.eq(table, key, value);
          return query;
        },
        single: () =>
          Promise.resolve({
            data: {
              commercial_snapshot: {
                meli_items: {
                  item: {
                    name: "Nombre al vender",
                    sku: "SKU-VENDIDO",
                    brand: null,
                    variant_name: null,
                    unit_of_measure: "KG",
                    tracks_stock_units: false,
                  },
                },
              },
            },
            error: null,
          }),
        maybeSingle: mocks.receipt,
        range: (from: number, to: number) => {
          mocks.range(table, from, to);
          if (table === "stock_movements") {
            return Promise.resolve({
              error: null,
              count: 1,
              data: [
                {
                  id: movementId,
                  mercadolibre_sale_item_id: "item",
                  quantity: 2,
                  unit_quantity: null,
                  item: {
                    id: "item",
                    product_id: "product",
                    description: "Nombre cambiado",
                  },
                  lot: {
                    id: "lot",
                    lot_number: "LOTE-1",
                    expiration_date: null,
                    product_id: "product",
                    product_variant_id: null,
                  },
                },
              ],
            });
          }
          return Promise.resolve({
            error: null,
            count: received.length,
            data: received.slice(from, to + 1),
          });
        },
      }
    );
    return query;
  });
}

describe("Meli physical-return services", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    received = [];
    productUnit = "KG";
    mocks.auth.mockResolvedValue({ userId: "actor" });
    mocks.sale.mockResolvedValue({
      id: saleId,
      organizationId: "org",
      warehouse_id: "warehouse",
      warehouseName: "Original",
      status: "DELIVERED",
      sale_number: 1,
      items: [],
    });
    mocks.warehouses.mockResolvedValue([
      { id: "warehouse", name: "Original", is_active: true, is_default: false },
      { id: "principal", name: "Principal", is_active: true, is_default: true },
    ]);
    mocks.admin.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({
      data: [{ return_id: returnId, idempotent: false }],
      error: null,
    });
    mocks.receipt.mockResolvedValue({ data: null, error: null });
    installReaders();
  });
  it("sends only a canonical physical receipt, actor and tenant to the atomic writer", async () => {
    expect(await createMeliPhysicalReturn("org", input)).toEqual({
      returnId,
      saleId,
      idempotent: false,
    });
    expect(mocks.ensure).toHaveBeenCalledWith("mercadolibre.manage", "org");
    expect(mocks.rpc).toHaveBeenCalledWith("commit_mercadolibre_return", {
      p_org_id: "org",
      p_actor_id: "actor",
      p_idempotency_key: input.idempotencyKey,
      p_payload: {
        sales_order_id: saleId,
        return_date: input.returnDate,
        reason: input.reason,
        allow_default_fallback: false,
        items: [
          {
            source_movement_id: movementId,
            quantity: 0.3,
            unit_quantity: 0,
            restock: true,
          },
        ],
      },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("lets the RPC recover a commit before checking changed availability or source status", async () => {
    mocks.sale.mockResolvedValue({
      id: saleId,
      organizationId: "org",
      warehouse_id: "warehouse",
      status: "CANCELLED",
    });
    mocks.rpc.mockResolvedValue({
      data: [{ return_id: returnId, idempotent: true }],
      error: null,
    });
    expect((await createMeliPhysicalReturn("org", input)).idempotent).toBe(
      true
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.warehouses).not.toHaveBeenCalled();
  });
  it("denies missing manage permission before scope or elevated access", async () => {
    mocks.ensure.mockRejectedValue(new Error("Sin permiso"));
    await expect(createMeliPhysicalReturn("org", input)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.sale).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not query returns or write stock outside the sale's warehouse scope", async () => {
    mocks.sale.mockResolvedValue(null);
    await expect(listMeliPhysicalReturns("org", saleId)).rejects.toThrow(
      "fuera de tus depósitos"
    );
    await expect(createMeliPhysicalReturn("org", input)).rejects.toThrow(
      "fuera de tus depósitos"
    );
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invented actor or financial fields instead of passing them to SQL", async () => {
    await expect(
      createMeliPhysicalReturn("org", {
        ...input,
        actorId: "someone",
        amount: 100,
      })
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    "P0001",
    "23514",
    "40P01",
  ])("allows editing after confirmed SQL rollback %s", async (code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "La devolución supera el saldo físico" },
    });
    await expect(createMeliPhysicalReturn("org", input)).rejects.toMatchObject({
      canEdit: true,
    });
  });
  it("exposes the original-warehouse fallback only after an explicit rollback", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "Depósito inactivo",
        details: "WAREHOUSE_FALLBACK_CONFIRMATION_REQUIRED",
      },
    });
    await expect(createMeliPhysicalReturn("org", input)).rejects.toMatchObject({
      canEdit: true,
      requiresDefaultFallback: true,
    });
  });
  it("preserves uncertain requests for replay on transport failure or empty confirmation", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("timeout"));
    await expect(createMeliPhysicalReturn("org", input)).rejects.toMatchObject({
      canEdit: false,
    });
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(createMeliPhysicalReturn("org", input)).rejects.toMatchObject({
      canEdit: false,
    });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it("loads all prior receipts, including non-restocked quantities, beyond the API row limit", async () => {
    received = Array.from({ length: 1200 }, () => ({
      source_movement_id: movementId,
      quantity: 0.000_001,
      unit_quantity: 0,
    }));
    const result = await getMeliPhysicalReturnForm("org", saleId);
    expect(result.origins.data[0]).toMatchObject({
      name: "Nombre al vender",
      sku: "SKU-VENDIDO",
      returnedQuantity: 0.0012,
      remainingQuantity: 1.9988,
      restockAllowed: true,
    });
    expect(mocks.range).toHaveBeenCalledWith(
      "mercadolibre_return_items",
      1000,
      1499
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "stock_movements",
      "item.sales_order_id",
      saleId
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "stock_movements",
      "warehouse_id",
      "warehouse"
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "mercadolibre_return_items",
      "receipt.organization_id",
      "org"
    );
    expect(mocks.eq).not.toHaveBeenCalledWith(
      "mercadolibre_return_items",
      "restock",
      true
    );
  });
  it("keeps the historical unit and disables stock reentry after a catalog unit change", async () => {
    productUnit = "LT";
    const result = await getMeliPhysicalReturnForm("org", saleId);
    expect(result.origins.data[0]).toMatchObject({
      unitOfMeasure: "KG",
      restockAllowed: false,
    });
  });
  it("does not substitute a warehouse that is no longer assigned to the reader", async () => {
    mocks.warehouses.mockResolvedValue([
      { id: "principal", is_active: true, is_default: true },
    ]);
    await expect(getMeliPhysicalReturnForm("org", saleId)).rejects.toThrow(
      "acceso al depósito de origen"
    );
  });
  it("scopes a guessed receipt identifier to the supplied sale and tenant", async () => {
    expect(
      await getMeliPhysicalReturnDetail("org", saleId, returnId)
    ).toBeNull();
    expect(mocks.eq).toHaveBeenCalledWith(
      "mercadolibre_returns",
      "organization_id",
      "org"
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "mercadolibre_returns",
      "sales_order_id",
      saleId
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      "mercadolibre_returns",
      "source_warehouse_id",
      "warehouse"
    );
  });
  it("renders the immutable product name and both stock legs without exposing the stored request", async () => {
    mocks.receipt.mockResolvedValue({
      error: null,
      data: {
        id: returnId,
        return_date: "2026-11-17",
        received_at: "2026-11-17T12:00:00Z",
        created_by: "actor",
        reason: "Recibido",
        request_payload: { private: true },
        warehouse: { name: "Principal" },
        items: [
          {
            id: "return-item",
            sales_order_item_id: "item",
            source_movement_id: movementId,
            source_lot_id: "original-lot",
            quantity: 0.3,
            unit_quantity: 0,
            restock: true,
            lot: { lot_number: "LOTE-1", expiration_date: null },
            movements: [
              {
                id: "inbound",
                lot_id: "destination-lot",
                lot: { lot_number: "LOTE-1" },
              },
            ],
          },
        ],
      },
    });
    const result = await getMeliPhysicalReturnDetail("org", saleId, returnId);
    expect(result).toMatchObject({
      createdBy: "actor",
      sourceWarehouseName: "Original",
      warehouseName: "Principal",
      items: [
        {
          name: "Nombre al vender",
          sourceMovementId: movementId,
          sourceLotId: "original-lot",
          movements: [
            { id: "inbound", lotId: "destination-lot", lotNumber: "LOTE-1" },
          ],
        },
      ],
    });
    expect(result).not.toHaveProperty("request_payload");
  });
  it("preserves a non-restocked physical receipt without inventing an inbound movement", async () => {
    mocks.receipt.mockResolvedValue({
      error: null,
      data: {
        id: returnId,
        return_date: "2026-11-17",
        received_at: "2026-11-17T12:00:00Z",
        created_by: "actor",
        reason: "Mercadería dañada",
        warehouse: { name: "Original" },
        items: [
          {
            id: "damaged",
            sales_order_item_id: "item",
            source_movement_id: movementId,
            source_lot_id: "lot",
            quantity: 0.3,
            unit_quantity: 0,
            restock: false,
            lot: { lot_number: "LOTE-1", expiration_date: null },
            movements: [],
          },
        ],
      },
    });
    expect(
      (await getMeliPhysicalReturnDetail("org", saleId, returnId))?.items[0]
    ).toMatchObject({ restock: false, movements: [] });
  });
  it("does not present a restocked document with a missing stock leg as a complete receipt", async () => {
    mocks.receipt.mockResolvedValue({
      error: null,
      data: { id: returnId, items: [{ restock: true, movements: [] }] },
    });
    await expect(
      getMeliPhysicalReturnDetail("org", saleId, returnId)
    ).rejects.toThrow("trazabilidad de stock completa");
  });
});
