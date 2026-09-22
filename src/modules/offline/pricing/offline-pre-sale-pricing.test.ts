import { describe, expect, it } from "vitest";
import type { OfflinePreSaleDraft } from "../contracts/offline-pre-sale-draft";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import {
  buildOfflineProductPriceMap,
  revalidateOfflinePreSaleDraft,
} from "./offline-pre-sale-pricing";

const ids = {
  owner: "00000000-0000-4000-8000-000000000001",
  organization: "00000000-0000-4000-8000-000000000002",
  oldSnapshot: "00000000-0000-4000-8000-000000000003",
  snapshot: "00000000-0000-4000-8000-000000000004",
  draft: "00000000-0000-4000-8000-000000000005",
  customer: "00000000-0000-4000-8000-000000000006",
  product: "00000000-0000-4000-8000-000000000007",
  line: "00000000-0000-4000-8000-000000000008",
  tax: "00000000-0000-4000-8000-000000000009",
};

const tax = { taxId: ids.tax, name: "IVA", rate: 21, code: "5" };

function migrationSnapshot(): SellerOfflineSnapshotV1 {
  return {
    snapshotId: ids.snapshot,
    ownerUserId: ids.owner,
    organizationId: ids.organization,
    organization: { id: ids.organization, slug: "acme" },
    customers: [{ id: ids.customer, salesPriceListId: null }],
    sellers: [{ id: ids.owner, name: "Seller" }],
    taxes: [],
    products: [
      {
        id: ids.product,
        name: "Product",
        price: 100,
        supplierId: null,
        taxes: [tax],
      },
    ],
    salesPriceLists: [],
    customerPriceAssignments: [],
    purchasePriceListItems: [],
    settings: {
      purgeAfterHours: 72,
      defaultTaxIds: [],
      enabledPaymentMethods: ["efectivo"],
    },
  } as unknown as SellerOfflineSnapshotV1;
}

function migrationDraft(): OfflinePreSaleDraft {
  return {
    draftId: ids.draft,
    schemaVersion: 1,
    ownerUserId: ids.owner,
    organizationId: ids.organization,
    orgSlug: "acme",
    snapshotId: ids.oldSnapshot,
    status: "draft",
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    purgeAfterHours: 72,
    payload: {
      customerId: ids.customer,
      sellerId: ids.owner,
      paymentMethod: "efectivo",
      invoiceType: "NOTA_DE_VENTA",
      notes: "Keep me",
      items: [
        {
          lineId: ids.line,
          productId: ids.product,
          quantity: 3,
          unitPrice: 100,
          taxes: [tax],
        },
      ],
    },
  };
}

describe("offline pre-sale pricing", () => {
  it("aplica la lista general asignada al cliente", () => {
    const snapshot = {
      customers: [
        {
          id: "customer-1",
          salesPriceListId: "list-1",
        },
      ],
      products: [
        {
          id: "product-1",
          price: 100,
          supplierId: null,
        },
      ],
      salesPriceLists: [
        {
          id: "list-1",
          type: "PERCENTAGE",
          value: 10,
        },
      ],
      customerPriceAssignments: [],
      purchasePriceListItems: [],
    } as unknown as SellerOfflineSnapshotV1;

    expect(
      buildOfflineProductPriceMap(snapshot, "customer-1").get("product-1")
    ).toBe(110);
  });

  it("migra sin revisión cuando los datos comerciales no cambiaron", () => {
    const result = revalidateOfflinePreSaleDraft(
      migrationDraft(),
      migrationSnapshot()
    );

    expect(result.issues).toEqual([]);
    expect(result.commercialChanges).toEqual([]);
    expect(result.proposedDraft.snapshotId).toBe(ids.snapshot);
    expect(result.proposedDraft.payload.notes).toBe("Keep me");
    expect(result.proposedDraft.payload.items[0].quantity).toBe(3);
  });

  it("requiere revisión si cambian precio o impuestos", () => {
    const snapshot = migrationSnapshot();
    snapshot.products[0].price = 125;
    snapshot.products[0].taxes = [{ ...tax, rate: 10.5 }];

    const result = revalidateOfflinePreSaleDraft(migrationDraft(), snapshot);

    expect(result.commercialChanges.map(({ kind }) => kind)).toEqual([
      "price",
      "taxes",
    ]);
    expect(result.proposedDraft.payload.items[0]).toMatchObject({
      quantity: 3,
      unitPrice: 125,
      taxes: [{ rate: 10.5 }],
    });
  });

  it("bloquea referencias de cliente y producto ausentes sin descartarlas", () => {
    const snapshot = migrationSnapshot();
    snapshot.customers = [];
    snapshot.products = [];
    const draft = migrationDraft();

    const result = revalidateOfflinePreSaleDraft(draft, snapshot);

    expect(result.issues.map(({ kind }) => kind)).toEqual([
      "customer",
      "product",
    ]);
    expect(result.proposedDraft.payload.customerId).toBe(ids.customer);
    expect(result.proposedDraft.payload.items).toEqual(draft.payload.items);
  });

  it("produce un borrador aceptable con el snapshot y valores actuales", () => {
    const snapshot = migrationSnapshot();
    snapshot.products[0].price = 125;
    const accepted = revalidateOfflinePreSaleDraft(
      migrationDraft(),
      snapshot
    ).proposedDraft;
    const result = revalidateOfflinePreSaleDraft(accepted, snapshot);

    expect(result).toMatchObject({
      needsMigration: false,
      issues: [],
      commercialChanges: [],
    });
    expect(accepted.payload.items[0].unitPrice).toBe(125);
  });
});
