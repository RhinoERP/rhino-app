import { describe, expect, it } from "vitest";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import {
  etagMatches,
  getSellerOfflineSnapshotEtag,
} from "./seller-offline-snapshot-version";

const snapshot = {
  schemaVersion: 1,
  snapshotId: "00000000-0000-4000-8000-000000000001",
  generatedAt: "2026-09-30T12:00:00.000Z",
  expiresAt: "2026-10-01T00:00:00.000Z",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  organization: {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "acme",
    name: "Acme",
    cuit: null,
  },
  customers: [],
  products: [],
  taxes: [],
  sellers: [],
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

describe("seller offline snapshot etag", () => {
  it("ignores refresh metadata but changes with commercial content", () => {
    const current = getSellerOfflineSnapshotEtag(snapshot);
    const refreshed = getSellerOfflineSnapshotEtag({
      ...snapshot,
      snapshotId: "00000000-0000-4000-8000-000000000004",
      generatedAt: "2026-09-30T12:20:00.000Z",
      expiresAt: "2026-10-01T00:20:00.000Z",
    });
    const changed = getSellerOfflineSnapshotEtag({
      ...snapshot,
      organization: { ...snapshot.organization, name: "Acme actualizado" },
    });

    expect(refreshed).toBe(current);
    expect(changed).not.toBe(current);
  });

  it("matches a validator list", () => {
    const etag = getSellerOfflineSnapshotEtag(snapshot);
    expect(etagMatches(`"other", ${etag}`, etag)).toBe(true);
    expect(etagMatches("*", etag)).toBe(true);
    expect(etagMatches('"other"', etag)).toBe(false);
  });
});
