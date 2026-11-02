import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/org/[orgSlug]/stock/metrics/route";
import { WarehouseAccessError } from "../utils/warehouse-access-error";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  layout: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthResponse: mocks.auth }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationLayoutData: mocks.layout,
}));
vi.mock("./inventory.service", () => ({ getStockMetrics: mocks.metrics }));

const metrics = {
  warehouseScoped: false,
  canViewCosts: true,
  totalProducts: 3000,
  activeProducts: 2500,
  inactiveProducts: 500,
  totalUnits: 12_000,
  totalKg: 15,
  totalLt: 6,
  totalStockValue: 100,
  lowStockCount: 1,
};
const warehouseId = "22222222-2222-4222-8222-222222222222";
function request(search = "") {
  return GET(
    new NextRequest(`http://localhost/api/org/org/stock/metrics${search}`),
    { params: Promise.resolve({ orgSlug: "org" }) }
  );
}

describe("stock metrics endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.layout.mockResolvedValue({ permissions: ["inventory.read"] });
    mocks.metrics.mockResolvedValue(metrics);
  });

  it("requires an authenticated session", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "No autorizado" }, { status: 401 })
    );
    expect((await request()).status).toBe(401);
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it.each([
    { permissions: ["sales.read"] },
    { permissions: ["mercadolibre.access"] },
    { permissions: [] },
  ])("requires inventory permissions instead of trusting the UI", async ({
    permissions,
  }) => {
    mocks.layout.mockResolvedValue({ permissions });
    expect((await request()).status).toBe(403);
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("ignores table filters and only forwards organization, warehouse and cancellation", async () => {
    const response = await request(
      `?warehouseId=${warehouseId}&page=8&search=shoe&categoria=Shoes&status=inactive`
    );
    expect(response.status).toBe(200);
    expect(mocks.metrics).toHaveBeenCalledExactlyOnceWith(
      "org",
      warehouseId,
      expect.any(AbortSignal)
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data = await response.json();
    expect(data.totalProducts).toBe(3000);
    expect(data.totalUnits).toBe(12_000);
  });

  it("strips valuation for readers even if a service accidentally includes it", async () => {
    const response = await request();
    const data = await response.json();
    expect(data.canViewCosts).toBe(false);
    expect(data).not.toHaveProperty("totalStockValue");
  });

  it.each([
    "inventory.manage",
    "organization.admin",
  ])("preserves authorized valuation for %s", async (permission) => {
    mocks.layout.mockResolvedValue({ permissions: [permission] });
    expect(await (await request()).json()).toEqual(metrics);
  });

  it("rejects malformed warehouse IDs", async () => {
    expect((await request("?warehouseId=invalid")).status).toBe(400);
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("preserves access-denied status after a warehouse assignment is revoked", async () => {
    mocks.metrics.mockRejectedValue(
      new WarehouseAccessError("Acceso revocado", 403)
    );
    expect((await request(`?warehouseId=${warehouseId}`)).status).toBe(403);
  });

  it("reports a timeout without exposing database details or false zero indicators", async () => {
    mocks.metrics.mockRejectedValue(
      new Error("statement timeout: internal SQL")
    );
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "No se pudieron cargar los indicadores de stock",
    });
  });
});
