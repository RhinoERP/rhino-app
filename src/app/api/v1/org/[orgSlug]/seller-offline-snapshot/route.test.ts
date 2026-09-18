import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createSnapshotMock = vi.fn();

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
    createSnapshotMock.mockResolvedValue({
      schemaVersion: 1,
      customers: [{ id: "customer-1" }],
      products: [{ id: "product-1" }, { id: "product-2" }],
    });
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
    expect(Number(response.headers.get("x-snapshot-bytes"))).toBeGreaterThan(0);
    expect(createSnapshotMock).toHaveBeenCalledWith("acme");
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
