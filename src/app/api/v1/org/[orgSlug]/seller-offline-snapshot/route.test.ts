import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createSnapshotMock = vi.fn();
const QUOTED_ETAG = /^".+"$/;
const snapshot = {
  schemaVersion: 1,
  snapshotId: "00000000-0000-4000-8000-000000000001",
  generatedAt: "2026-09-30T12:00:00.000Z",
  expiresAt: "2026-10-01T00:00:00.000Z",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  customers: [{ id: "customer-1" }],
  products: [{ id: "product-1" }, { id: "product-2" }],
};

class SnapshotError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

vi.mock("@/modules/offline/service/seller-offline-snapshot.service", () => ({
  createSellerOfflineSnapshot: createSnapshotMock,
  SellerOfflineSnapshotError: SnapshotError,
}));

describe("seller offline snapshot route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("devuelve el snapshot sin permitir cache y expone metricas", async () => {
    createSnapshotMock.mockResolvedValue(snapshot);
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(
        "http://localhost/api/v1/org/acme/seller-offline-snapshot"
      ),
      { params: Promise.resolve({ orgSlug: "acme" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-snapshot-schema-version")).toBe("1");
    expect(response.headers.get("x-snapshot-customers")).toBe("1");
    expect(response.headers.get("x-snapshot-products")).toBe("2");
    expect(response.headers.get("etag")).toMatch(QUOTED_ETAG);
    expect(Number(response.headers.get("x-snapshot-bytes"))).toBeGreaterThan(0);
    expect(createSnapshotMock).toHaveBeenCalledWith("acme");
  });

  it("devuelve 304 con vigencia nueva cuando el contenido no cambio", async () => {
    createSnapshotMock.mockResolvedValue(snapshot);
    const { GET } = await import("./route");
    const first = await GET(
      new NextRequest(
        "http://localhost/api/v1/org/acme/seller-offline-snapshot"
      ),
      { params: Promise.resolve({ orgSlug: "acme" }) }
    );
    const etag = first.headers.get("etag");

    const response = await GET(
      new NextRequest(
        "http://localhost/api/v1/org/acme/seller-offline-snapshot",
        { headers: { "If-None-Match": etag ?? "" } }
      ),
      { params: Promise.resolve({ orgSlug: "acme" }) }
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("etag")).toBe(etag);
    expect(response.headers.get("x-snapshot-generated-at")).toBe(
      snapshot.generatedAt
    );
    expect(response.headers.get("x-snapshot-expires-at")).toBe(
      snapshot.expiresAt
    );
    expect(await response.text()).toBe("");
    expect(createSnapshotMock).toHaveBeenCalledTimes(2);
  });

  it("preserva errores tipados sin filtrar detalles internos", async () => {
    createSnapshotMock.mockRejectedValue(
      new SnapshotError(
        "OFFLINE_DISABLED",
        "Los datos offline no estan habilitados para esta organizacion",
        403
      )
    );
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(
        "http://localhost/api/v1/org/acme/seller-offline-snapshot"
      ),
      { params: Promise.resolve({ orgSlug: "acme" }) }
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      code: "OFFLINE_DISABLED",
      error: "Los datos offline no estan habilitados para esta organizacion",
    });
  });
});
