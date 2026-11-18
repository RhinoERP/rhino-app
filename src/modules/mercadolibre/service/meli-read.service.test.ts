import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMeliCommercialReport,
  getMeliSale,
  getMeliSetup,
  getMeliStockWarehouse,
  listMeliSales,
  searchMeliCustomers,
  searchMeliProducts,
} from "./meli-read.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  warehouses: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  or: vi.fn(),
  config: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
  getDirectSaleConfigByOrgSlug: mocks.config,
}));
vi.mock("@/modules/inventory/service/warehouse-stock.service", () => ({
  getAvailableWarehouses: mocks.warehouses,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));

const saleId = "00000000-0000-4000-8000-000000000001";
const warehouseId = "00000000-0000-4000-8000-000000000002";
const receiver = {
  version: 1,
  tax_condition: "CONSUMIDOR_FINAL",
  document_type: "DNI",
  document_number: "12345678",
  first_name: "Ana",
  last_name: "Pérez",
  address: "Calle 123",
};

function resultsFor(values: Record<string, unknown>) {
  mocks.from.mockImplementation((table: string) => {
    const promise = Promise.resolve({
      data: values[table] ?? [],
      error: null,
      count: 1,
    });
    const query = Object.assign(promise, {
      select: () => query,
      eq: (key: string, value: unknown) => {
        mocks.eq(key, value);
        return query;
      },
      in: (key: string, value: unknown) => {
        mocks.in(key, value);
        return query;
      },
      or: (value: string) => {
        mocks.or(value);
        return query;
      },
      gt: () => query,
      gte: () => query,
      lte: () => query,
      order: () => query,
      limit: () => query,
      range: () => query,
      maybeSingle: () => promise,
    });
    return query;
  });
}

describe("Meli scoped readers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(undefined);
    mocks.config.mockResolvedValue({
      direct_sale_tax_ids: [],
      direct_sale_tax_id: null,
    });
    mocks.warehouses.mockResolvedValue([
      {
        id: warehouseId,
        name: "Meli",
        is_active: true,
        direct_sale_enabled: true,
      },
    ]);
    mocks.admin.mockReturnValue({ from: mocks.from });
  });
  it("does not consult sales without assigned warehouses", async () => {
    mocks.warehouses.mockResolvedValueOnce([]);
    expect(await listMeliSales("org")).toEqual({ data: [], count: 0 });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses only the configured assigned warehouse for Meli inventory", async () => {
    resultsFor({ mercadolibre_settings: { warehouse_id: warehouseId } });
    expect((await getMeliStockWarehouse("org")).id).toBe(warehouseId);
    await expect(getMeliStockWarehouse("org", saleId)).rejects.toThrow(
      "depósito configurado"
    );
  });
  it("rejects a configured warehouse no longer assigned to the reader", async () => {
    mocks.warehouses.mockResolvedValue([]);
    resultsFor({ mercadolibre_settings: { warehouse_id: warehouseId } });
    await expect(getMeliStockWarehouse("org")).rejects.toThrow("asignado");
  });
  it("scopes commercial totals to delivered Meli sales in assigned warehouses", async () => {
    resultsFor({
      sales_orders: [
        {
          currency: "ARS",
          total_amount: 121,
          total_tax_amount: 21,
          arca_status: "authorized",
        },
      ],
    });
    const result = await getMeliCommercialReport("org", {
      from: "2026-11-01",
      to: "2026-11-16",
    });
    expect(result.currencies[0]).toMatchObject({
      total: 121,
      count: 1,
      taxes: 21,
    });
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
    expect(mocks.eq).toHaveBeenCalledWith("status", "DELIVERED");
    expect(mocks.in).toHaveBeenCalledWith("warehouse_id", [warehouseId]);
  });
  it("keeps the existing single-tax direct-sale configuration fallback", async () => {
    mocks.config.mockResolvedValue({
      direct_sale_tax_ids: [],
      direct_sale_tax_id: "tax",
    });
    resultsFor({
      mercadolibre_settings: { warehouse_id: warehouseId },
      taxes: [{ id: "tax", name: "IVA", rate: 21 }],
      organization_arca_settings: {
        issuer_vat_condition: "Responsable inscripto",
      },
    });
    const setup = await getMeliSetup("org");
    expect(setup.defaultTaxIds).toEqual(["tax"]);
    expect(setup.invoiceTypes).toEqual(["FACTURA_A", "FACTURA_B"]);
  });
  it("bounds the detail by organization, channel and historical warehouse access", async () => {
    resultsFor({
      sales_orders: {
        id: saleId,
        warehouse_id: warehouseId,
        fiscal_receiver_snapshot: receiver,
        items: [],
        taxes: [],
      },
    });
    const result = await getMeliSale("org", saleId);
    expect(result?.receiver).toEqual(receiver);
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
    expect(mocks.eq).toHaveBeenCalledWith("id", saleId);
    expect(mocks.in).toHaveBeenCalledWith("warehouse_id", [warehouseId]);
    expect(mocks.warehouses).toHaveBeenCalledWith("org", undefined, {
      includeInactive: true,
    });
  });
  it("checks permissions before creating an elevated client", async () => {
    mocks.ensure.mockRejectedValueOnce(new Error("Sin acceso"));
    await expect(listMeliSales("org")).rejects.toThrow("Sin acceso");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("uses the configured warehouse, not a MELI SKU prefix", async () => {
    const productId = "product";
    resultsFor({
      mercadolibre_settings: { warehouse_id: warehouseId },
      products: [
        {
          id: productId,
          name: "Camisa",
          sku: "CAM-01",
          unit_of_measure: "UN",
          has_variants: false,
          tracks_stock_units: false,
        },
      ],
      direct_sale_prices: [{ product_id: productId, price: 50 }],
      products_with_price: [{ id: productId, calculated_sale_price: 100 }],
      product_variants: [],
      product_lots: [
        {
          id: "lot",
          product_id: productId,
          product_variant_id: null,
          quantity_available: 3,
          unit_quantity_available: null,
          lot_number: "L",
          expiration_date: null,
          created_at: null,
        },
      ],
    });
    const products = await searchMeliProducts("org", "camisa");
    expect(products[0]).toMatchObject({ sku: "CAM-01", price: 50, stock: 3 });
    expect(mocks.eq).toHaveBeenCalledWith(
      "product_lots.warehouse_id",
      warehouseId
    );
    expect(mocks.or).toHaveBeenCalledWith(
      "name.ilike.%camisa%,sku.ilike.%camisa%"
    );
  });
  it("allows only the bounded customer search needed by the sale", async () => {
    resultsFor({
      customers: [],
      mercadolibre_settings: { warehouse_id: warehouseId },
    });
    await searchMeliCustomers("org", "Empresa");
    expect(mocks.ensure).toHaveBeenCalledWith("mercadolibre.manage", "org");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith("customers");
  });
  it("does not expose customer data after warehouse access is revoked", async () => {
    mocks.warehouses.mockResolvedValueOnce([]);
    resultsFor({ mercadolibre_settings: { warehouse_id: warehouseId } });
    await expect(searchMeliCustomers("org", "Cliente")).rejects.toThrow(
      "depósito Meli"
    );
    expect(mocks.from).not.toHaveBeenCalledWith("customers");
  });
});
