import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/org/[orgSlug]/stock/[productId]/variants/route";
import { WarehouseAccessError } from "../utils/warehouse-access-error";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  layout: vi.fn(),
  variants: vi.fn(),
  meliWarehouse: vi.fn(),
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
vi.mock("@/modules/mercadolibre/service/meli-read.service", () => ({
  getMeliStockWarehouse: mocks.meliWarehouse,
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
    mocks.meliWarehouse.mockResolvedValue({ id: warehouseId });
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

  it("allows distributor catalog readers to load active product variants only", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["distributor.catalog"],
      currentOrganization: { id: "org-id" },
    });
    mocks.variants.mockResolvedValue([
      {
        id: "variant-id",
        talle: "M",
        color: "Negro",
        internal_field: "not exposed",
        product_lots: { quantity_available: 4 },
      },
    ]);

    const response = await request();

    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
    expect(mocks.variants).toHaveBeenCalledWith("org", productId, undefined);
    expect(mocks.meliWarehouse).not.toHaveBeenCalled();
    expect(mocks.ilike).not.toHaveBeenCalled();
    expect(await response.json()).toEqual([
      {
        id: "variant-id",
        talle: "M",
        color: "Negro",
        product_lots: { quantity_available: 4 },
      },
    ]);
  });

  it("does not allow distributor catalog readers to request stock by warehouse", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["distributor.catalog"],
      currentOrganization: { id: "org-id" },
    });

    const response = await request(`?warehouseId=${warehouseId}`);

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it("does not return variants for a missing Meli product", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.access"],
      currentOrganization: { id: "org-id" },
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.meliWarehouse).toHaveBeenCalledWith("org", undefined);
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it("scopes Meli variants to its configured warehouse without filtering SKU", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.access"],
      currentOrganization: { id: "org-id" },
    });
    expect((await request()).status).toBe(200);
    expect(mocks.ilike).not.toHaveBeenCalled();
    expect(mocks.variants).toHaveBeenCalledWith("org", productId, warehouseId);
  });

  it("rejects attempts to select another warehouse as a Meli-only reader", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.manage"],
      currentOrganization: { id: "org-id" },
    });
    mocks.meliWarehouse.mockRejectedValue(
      new WarehouseAccessError("Depósito fuera de alcance", 403)
    );
    expect((await request(`?warehouseId=${warehouseId}`)).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it.each([
    "",
    `?warehouseId=${warehouseId}`,
  ])("keeps the Meli warehouse and distributor sanitization for mixed permissions %s", async (search) => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.access", "distributor.catalog"],
      currentOrganization: { id: "org-id" },
    });
    mocks.variants.mockResolvedValue([
      {
        id: "variant-id",
        talle: "M",
        color: "Negro",
        internal_field: "not exposed",
        product_lots: { quantity_available: 0 },
      },
    ]);
    const response = await request(search);
    expect(response.status).toBe(200);
    expect(mocks.meliWarehouse).toHaveBeenCalledWith(
      "org",
      search ? warehouseId : undefined
    );
    expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
    expect(mocks.ilike).not.toHaveBeenCalled();
    expect(mocks.variants).toHaveBeenCalledWith("org", productId, warehouseId);
    expect(await response.json()).toEqual([
      {
        id: "variant-id",
        talle: "M",
        color: "Negro",
        product_lots: { quantity_available: 0 },
      },
    ]);
  });

  it("does not let the distributor permission bypass the Meli warehouse check", async () => {
    mocks.layout.mockResolvedValue({
      permissions: ["mercadolibre.manage", "distributor.catalog"],
      currentOrganization: { id: "org-id" },
    });
    mocks.meliWarehouse.mockRejectedValue(
      new WarehouseAccessError("Depósito fuera de alcance", 403)
    );
    expect((await request(`?warehouseId=${warehouseId}`)).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.variants).not.toHaveBeenCalled();
  });

  it("preserves the inventory scope when inventory, Meli and distributor permissions coexist", async () => {
    mocks.layout.mockResolvedValue({
      permissions: [
        "inventory.read",
        "mercadolibre.access",
        "distributor.catalog",
      ],
      currentOrganization: { id: "org-id" },
    });
    const variants = [
      {
        id: "variant-id",
        internal_field: "inventory metadata",
        product_lots: { quantity_available: 4 },
      },
    ];
    mocks.variants.mockResolvedValue(variants);
    const response = await request(`?warehouseId=${warehouseId}`);
    expect(response.status).toBe(200);
    expect(mocks.meliWarehouse).not.toHaveBeenCalled();
    expect(mocks.eq).not.toHaveBeenCalledWith("is_active", true);
    expect(mocks.variants).toHaveBeenCalledWith("org", productId, warehouseId);
    expect(await response.json()).toEqual(variants);
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
