import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineCommandV1 } from "@/modules/offline/contracts/offline-command";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";

const {
  adminRpcMock,
  createAdminClientMock,
  createClientMock,
  createSnapshotMock,
  rpcMock,
} = vi.hoisted(() => ({
  adminRpcMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  createSnapshotMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/modules/offline/service/seller-offline-snapshot.service", () => ({
  createSellerOfflineSnapshot: createSnapshotMock,
  SellerOfflineSnapshotError: class extends Error {},
}));

import {
  executeOfflineCommand,
  findOfflinePreSaleCommercialChanges,
  OfflineCommandError,
} from "./offline-command.service";

const command = {
  commandId: "00000000-0000-4000-8000-000000000001",
  schemaVersion: 1,
  type: "preSale.create",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  orgSlugAtCreation: "luchobet",
  snapshotId: "00000000-0000-4000-8000-000000000004",
  createdAt: "2026-09-17T13:00:00.000Z",
  payload: {
    customerId: "00000000-0000-4000-8000-000000000005",
    sellerId: "00000000-0000-4000-8000-000000000002",
    saleDate: "2026-09-17",
    paymentMethod: "efectivo",
    invoiceType: "NOTA_DE_VENTA",
    observations: "",
    items: [
      {
        lineId: "00000000-0000-4000-8000-000000000006",
        productId: "00000000-0000-4000-8000-000000000007",
        quantity: 2,
        unitPrice: 100,
        taxes: [
          {
            taxId: "00000000-0000-4000-8000-000000000008",
            name: "IVA 21%",
            rate: 21,
            code: "IVA_21",
          },
        ],
      },
    ],
  },
} satisfies OfflineCommandV1;

const snapshot = {
  schemaVersion: 1,
  snapshotId: "00000000-0000-4000-8000-000000000009",
  generatedAt: "2026-09-17T13:00:00.000Z",
  expiresAt: "2026-09-18T01:00:00.000Z",
  ownerUserId: command.ownerUserId,
  organizationId: command.organizationId,
  organization: {
    id: command.organizationId,
    slug: "luchobet",
    name: "LuchoBet",
    cuit: null,
  },
  customers: [
    {
      id: command.payload.customerId,
      businessName: "Cliente",
      fantasyName: null,
      clientNumber: null,
      cuit: null,
      city: null,
      assignedSellerId: command.ownerUserId,
      salesPriceListId: null,
      dueDays: null,
      taxCondition: null,
    },
  ],
  products: [
    {
      id: command.payload.items[0].productId,
      name: "Producto",
      sku: "SKU",
      brand: null,
      price: 100,
      currency: "ARS",
      supplierId: null,
      supplierName: null,
      categoryId: null,
      categoryName: null,
      unitOfMeasure: "UN",
      tracksStockUnits: false,
      totalQuantity: 10,
      totalUnitQuantity: null,
      averageQuantityPerUnit: null,
      weightPerUnit: null,
      unitsPerBox: null,
      boxesPerPallet: null,
      taxes: command.payload.items[0].taxes,
    },
  ],
  taxes: [],
  sellers: [{ id: command.ownerUserId, name: "Vendedor" }],
  salesPriceLists: [],
  customerPriceAssignments: [],
  purchasePriceListItems: [],
  settings: {
    purgeAfterHours: 72,
    configurablePriceListsEnabled: false,
    dueDaysEnabled: false,
    dueDaysDefault: 30,
    defaultTaxIds: [],
    enabledPaymentMethods: ["efectivo"],
    defaultPaymentMethod: "efectivo",
    defaultInvoiceType: "NOTA_DE_VENTA",
  },
} satisfies SellerOfflineSnapshotV1;

describe("executeOfflineCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({ rpc: rpcMock });
    createAdminClientMock.mockReturnValue({ rpc: adminRpcMock });
    createSnapshotMock.mockResolvedValue(snapshot);
  });

  it("returns a duplicate before creating a fresh snapshot", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ sales_order_id: "00000000-0000-4000-8000-000000000010" }],
      error: null,
    });

    await expect(executeOfflineCommand(command)).resolves.toMatchObject({
      duplicate: true,
      resourceId: "00000000-0000-4000-8000-000000000010",
    });
    expect(rpcMock).toHaveBeenCalledWith("get_offline_pre_sale_replay_result", {
      p_command: command,
    });
    expect(createSnapshotMock).not.toHaveBeenCalled();
  });

  it("continues with snapshot validation when no replay exists", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    adminRpcMock.mockResolvedValueOnce({
      data: [
        {
          sales_order_id: "00000000-0000-4000-8000-000000000010",
          duplicate: false,
        },
      ],
      error: null,
    });

    await expect(executeOfflineCommand(command)).resolves.toMatchObject({
      duplicate: false,
    });
    expect(createSnapshotMock).toHaveBeenCalledWith(command.orgSlugAtCreation);
    expect(adminRpcMock).toHaveBeenCalledWith(
      "create_offline_pre_sale_atomic",
      {
        p_actor_user_id: command.ownerUserId,
        p_command: command,
      }
    );
  });

  it("blocks a new command when current commercial data changed", async () => {
    const changedSnapshot = structuredClone(snapshot);
    changedSnapshot.products[0].price = 120;
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    createSnapshotMock.mockResolvedValue(changedSnapshot);

    await expect(executeOfflineCommand(command)).rejects.toMatchObject({
      code: "REVIEW_REQUIRED",
      retryable: false,
    });
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ["OFFLINE_AUTH_REQUIRED", "AUTH_REQUIRED", true, 401],
    ["OFFLINE_FORBIDDEN", "FORBIDDEN", false, 403],
    ["OFFLINE_IDEMPOTENCY_CONFLICT", "VALIDATION_ERROR", false, 400],
    ["OFFLINE_RETRYABLE", "RETRYABLE", true, 503],
    ["connection lost", "RETRYABLE", true, 503],
  ])("maps replay RPC error %s", async (message, code, retryable, status) => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message } });

    await expect(executeOfflineCommand(command)).rejects.toMatchObject({
      code,
      retryable,
      status,
    });
    expect(createSnapshotMock).not.toHaveBeenCalled();
  });
});

describe("findOfflinePreSaleCommercialChanges", () => {
  it("acepta precios e impuestos vigentes", () => {
    expect(findOfflinePreSaleCommercialChanges(command, snapshot)).toEqual([]);
  });

  it("informa cambios de precio e impuestos", () => {
    const changedSnapshot = structuredClone(snapshot);
    changedSnapshot.products[0].price = 120;
    changedSnapshot.products[0].taxes[0].rate = 10.5;

    expect(
      findOfflinePreSaleCommercialChanges(command, changedSnapshot)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "payload.items.0.unitPrice" }),
        expect.objectContaining({ path: "payload.items.0.taxes" }),
      ])
    );
  });

  it("rechaza referencias que dejaron de estar visibles", () => {
    const changedSnapshot = structuredClone(snapshot);
    changedSnapshot.customers = [];

    expect(() =>
      findOfflinePreSaleCommercialChanges(command, changedSnapshot)
    ).toThrow(OfflineCommandError);
  });
});
