import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import { getSellerSnapshot, purgeAllOfflineData } from "../storage/offline-db";
import {
  OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS,
  refreshSellerOfflineSnapshot,
} from "./offline-snapshot-refresh";

const ownerUserId = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000003";
const initialTime = Date.parse("2026-09-30T12:00:00.000Z");
const snapshot = {
  schemaVersion: 1,
  snapshotId: "00000000-0000-4000-8000-000000000001",
  generatedAt: "2026-09-30T12:00:00.000Z",
  expiresAt: "2026-10-01T00:00:00.000Z",
  ownerUserId,
  organizationId,
  organization: { id: organizationId, slug: "acme", name: "Acme", cuit: null },
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

const responseForSnapshot = () =>
  new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      ETag: '"version-1"',
      "X-Snapshot-Expires-At": snapshot.expiresAt,
      "X-Snapshot-Generated-At": snapshot.generatedAt,
    },
  });

describe("offline snapshot refresh", () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    await purgeAllOfflineData();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { locks: undefined, onLine: true });
  });

  it("downloads the first snapshot and skips checks inside the interval", async () => {
    fetchMock.mockResolvedValueOnce(responseForSnapshot());

    const first = await refreshSellerOfflineSnapshot({
      organizationId,
      orgSlug: "acme",
      ownerUserId,
      now: initialTime,
    });
    const skipped = await refreshSellerOfflineSnapshot({
      organizationId,
      orgSlug: "acme",
      ownerUserId,
      now: initialTime + 60_000,
    });

    expect(first.status).toBe("updated");
    expect(skipped.status).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("renews validity after a conditional 304 without changing snapshot id", async () => {
    fetchMock.mockResolvedValueOnce(responseForSnapshot());
    await refreshSellerOfflineSnapshot({
      organizationId,
      orgSlug: "acme",
      ownerUserId,
      now: initialTime,
    });
    const refreshedAt = initialTime + OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS;
    const generatedAt = new Date(refreshedAt).toISOString();
    const expiresAt = new Date(refreshedAt + 12 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: {
          ETag: '"version-1"',
          "X-Snapshot-Expires-At": expiresAt,
          "X-Snapshot-Generated-At": generatedAt,
        },
      })
    );

    const result = await refreshSellerOfflineSnapshot({
      organizationId,
      orgSlug: "acme",
      ownerUserId,
      now: refreshedAt,
    });
    const requestHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;

    expect(result.status).toBe("unchanged");
    expect(requestHeaders.get("if-none-match")).toBe('"version-1"');
    expect(result.record?.snapshot.snapshotId).toBe(snapshot.snapshotId);
    expect(result.record?.snapshot.expiresAt).toBe(expiresAt);
    expect(result.record?.lastCheckedAt).toBe(generatedAt);
  });

  it("preserves the previous snapshot when refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(responseForSnapshot());
    await refreshSellerOfflineSnapshot({
      organizationId,
      orgSlug: "acme",
      ownerUserId,
      now: initialTime,
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Temporalmente no disponible" }, { status: 503 })
    );

    await expect(
      refreshSellerOfflineSnapshot({
        force: true,
        organizationId,
        orgSlug: "acme",
        ownerUserId,
        now: initialTime + 60_000,
      })
    ).rejects.toThrow("Temporalmente no disponible");

    await expect(
      getSellerSnapshot(ownerUserId, organizationId)
    ).resolves.toMatchObject({
      etag: '"version-1"',
      snapshot: { snapshotId: snapshot.snapshotId },
    });
  });
});
