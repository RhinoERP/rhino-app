import { afterEach, describe, expect, it, vi } from "vitest";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import {
  signSellerOfflineSnapshot,
  verifySellerOfflineSnapshotSignature,
} from "./seller-offline-snapshot-signature";

const ids = {
  owner: "00000000-0000-4000-8000-000000000001",
  organization: "00000000-0000-4000-8000-000000000002",
  snapshot: "00000000-0000-4000-8000-000000000003",
};

function snapshot(): SellerOfflineSnapshotV1 {
  return {
    schemaVersion: 1,
    snapshotId: ids.snapshot,
    generatedAt: "2026-11-10T12:00:00.000Z",
    expiresAt: "2026-11-10T23:00:00.000Z",
    ownerUserId: ids.owner,
    organizationId: ids.organization,
    organization: {
      id: ids.organization,
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
  };
}

describe("seller offline snapshot signatures", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("signs and verifies the immutable snapshot content and freshness metadata", () => {
    vi.stubEnv(
      "OFFLINE_SNAPSHOT_SIGNING_SECRET",
      "a-secure-test-secret-longer-than-32-bytes"
    );
    vi.stubEnv("OFFLINE_SNAPSHOT_SIGNING_KEY_ID", "test-key");
    const value = snapshot();
    const signature = signSellerOfflineSnapshot(value);

    expect(signature).toBeTruthy();
    if (!signature) {
      throw new Error("Expected a signed snapshot");
    }
    expect(verifySellerOfflineSnapshotSignature(value, signature)).toBe(true);
  });

  it("supports 304 refresh by signing fresh validity for the existing snapshot ID", () => {
    vi.stubEnv(
      "OFFLINE_SNAPSHOT_SIGNING_SECRET",
      "a-secure-test-secret-longer-than-32-bytes"
    );
    const current = snapshot();
    const refreshed = {
      ...current,
      generatedAt: "2026-11-10T13:00:00.000Z",
      expiresAt: "2026-11-11T00:00:00.000Z",
    };
    const signature = signSellerOfflineSnapshot(refreshed, current.snapshotId);
    if (!signature) {
      throw new Error("Expected a signed snapshot");
    }

    expect(
      verifySellerOfflineSnapshotSignature(
        { ...current, ...refreshed },
        signature
      )
    ).toBe(true);
    expect(
      verifySellerOfflineSnapshotSignature(
        { ...current, ...refreshed, expiresAt: current.expiresAt },
        signature
      )
    ).toBe(false);
  });

  it("rejects altered content, wrong identity, and malformed tokens", () => {
    vi.stubEnv(
      "OFFLINE_SNAPSHOT_SIGNING_SECRET",
      "a-secure-test-secret-longer-than-32-bytes"
    );
    const value = snapshot();
    const signature = signSellerOfflineSnapshot(value);
    if (!signature) {
      throw new Error("Expected a signed snapshot");
    }

    expect(
      verifySellerOfflineSnapshotSignature(
        { ...value, organizationId: ids.owner },
        signature
      )
    ).toBe(false);
    expect(verifySellerOfflineSnapshotSignature(value, "invalid")).toBe(false);
  });

  it("does not issue signatures without a configured 32-byte secret", () => {
    vi.stubEnv("OFFLINE_SNAPSHOT_SIGNING_SECRET", "too-short");
    expect(signSellerOfflineSnapshot(snapshot())).toBeNull();
  });
});
