import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/org/[orgSlug]/stock/[productId]/variants/route";
import { WarehouseAccessError } from "../utils/warehouse-access-error";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  layout: vi.fn(),
  variants: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuthResponse: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationLayoutData: mocks.layout,
}));
vi.mock("./inventory.service", () => ({
  getProductVariantsWithStock: mocks.variants,
}));

const productId = "11111111-1111-4111-8111-111111111111";
const warehouseId = "22222222-2222-4222-8222-222222222222";
const query = {
  select: mocks.select,
  eq: mocks.eq,
  ilike: mocks.ilike,
  maybeSingle: mocks.maybeSingle,
};

function request(search = "", id = productId) {
  return GET(
    new NextRequest(
      `http://localhost/api/org/org/stock/${id}/variants${search}`
    ),
    {
      params: Promise.resolve({ orgSlug: "org", productId: id }),
    }
  );
}

describe("stock variants endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.layout.mockResolvedValue({
      permissions: ["inventory.read"],
      currentOrganization: { id: "org-id" },
    });
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.ilike.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({
      data: { id: productId },
      error: null,
    });
    mocks.variants.mockResolvedValue([]);
  });

  it("returns 401 without a session", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "No autorizado" }, { status: 401 })
    );
    expect((await request()).status).toBe(401);
    expect(mocks.layout).not.toHaveBeenCalled();
  });

  it("denies authenticated users without stock permissions before querying products", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["purchases.read"],
      currentOrganization: { id: "org-id" },
    });
    expect((await request()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it("denies missing organization membership", async () => {
    mocks.layout.mockResolvedValue(null);
    expect((await request()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    "inventory.read",
    "inventory.read.all",
    "inventory.manage",
    "organization.admin",
  ])("allows %s and scopes the product to the requested organization", async (permission) => {
    mocks.layout.mockResolvedValue({
      permissions: [permission],
      currentOrganization: { id: "org-id" },
    });
    expect((await request(`?warehouseId=${warehouseId}`)).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org-id");
    expect(mocks.eq).toHaveBeenCalledWith("id", productId);
    expect(mocks.variants).toHaveBeenCalledWith("org", productId, warehouseId);
    expect(mocks.ilike).not.toHaveBeenCalled();
  });

  it("restricts MercadoLibre-only readers to MELI products", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.access"],
      currentOrganization: { id: "org-id" },
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.ilike).toHaveBeenCalledWith("sku", "MELI-%");
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it("allows a visible MercadoLibre product", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.access"],
      currentOrganization: { id: "org-id" },
    });
    expect((await request()).status).toBe(200);
    expect(mocks.ilike).toHaveBeenCalledWith("sku", "MELI-%");
  });

  it("returns 404 for a missing product or a product outside the organization", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed product and warehouse IDs", async () => {
    expect((await request("", "invalid")).status).toBe(400);
    expect((await request("?warehouseId=invalid")).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    403, 404,
  ] as const)("preserves expected warehouse status %s", async (status) => {
    mocks.variants.mockRejectedValue(
      new WarehouseAccessError("Depósito no disponible", status)
    );
    expect((await request(`?warehouseId=${warehouseId}`)).status).toBe(status);
  });

  it("does not expose internal database errors", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "internal SQL detail" },
    });
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "No se pudieron cargar las variantes",
    });
  });
});
