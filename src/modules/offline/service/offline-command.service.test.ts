import { describe, expect, it, vi } from "vitest";
import type { OfflineCommandV1 } from "@/modules/offline/contracts/offline-command";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/modules/offline/service/seller-offline-snapshot.service", () => ({
  createSellerOfflineSnapshot: vi.fn(),
  SellerOfflineSnapshotError: class extends Error {},
}));

import {
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
