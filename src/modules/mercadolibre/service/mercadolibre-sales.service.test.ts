import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateMeliSaleInput } from "../types";
import {
  createMercadoLibreSale,
  previewMercadoLibreSale,
} from "./mercadolibre-sales.service";

const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  existing: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  admin: vi.fn(),
  access: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: vi.fn(),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org-id" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "actor" } }, error: null }),
    },
    rpc: mocks.access,
  }),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));
const input: CreateMeliSaleInput = {
  orgSlug: "org",
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
  warehouseId: "00000000-0000-4000-8000-000000000002",
  marketplaceOrderNumber: "ML-123",
  saleDate: "2026-11-15",
  invoiceType: "FACTURA_B",
  receiver: {
    version: 1,
    tax_condition: "CONSUMIDOR_FINAL",
    document_type: "DNI",
    document_number: "12345678",
    first_name: "Ana",
    last_name: "Pérez",
    address: "Calle 123",
  },
  items: [
    {
      productId: "00000000-0000-4000-8000-000000000003",
      quantity: 1,
      unitPrice: 100,
    },
  ],
};

describe("Meli server confirmation replays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(undefined);
    mocks.access.mockResolvedValue({ data: true, error: null });
    mocks.existing.mockResolvedValue({ data: { id: "sale" }, error: null });
    mocks.rpc.mockResolvedValue({
      data: [{ sale_id: "sale", idempotent: true }],
      error: null,
    });
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.existing,
      };
      return query;
    });
    mocks.admin.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
  });
  it("builds a new sale from direct prices and product taxes without creating a POS payment", async () => {
    const id = input.items[0].productId;
    const values: Record<string, unknown> = {
      sales_orders: null,
      organization_arca_settings: {
        issuer_vat_condition: "RESPONSABLE_INSCRIPTO",
      },
      mercadolibre_settings: { warehouse_id: input.warehouseId },
      warehouses: {
        id: input.warehouseId,
        is_active: true,
        direct_sale_enabled: true,
      },
      organization_members: { is_active: true },
      products: [
        {
          id,
          name: "Producto",
          is_active: true,
          has_variants: false,
          unit_of_measure: "UN",
          tracks_stock_units: false,
        },
      ],
      direct_sale_prices: [{ product_id: id, price: 150 }],
      products_with_price: [{ id, calculated_sale_price: 200 }],
      product_lots: [
        {
          id: "lot",
          product_id: id,
          product_variant_id: null,
          quantity_available: 1,
          unit_quantity_available: null,
          expiration_date: null,
          created_at: null,
          lot_number: "L",
        },
      ],
      product_tax_assignments: [
        {
          product_id: id,
          tax: {
            id: "vat",
            name: "IVA",
            rate: 21,
            code: "IVA_21",
            is_active: true,
          },
        },
      ],
    };
    mocks.from.mockImplementation((table: string) => {
      const result = { data: values[table], error: null };
      const promise = Promise.resolve(result);
      const query = Object.assign(promise, {
        select: () => query,
        eq: () => query,
        in: () => query,
        gt: () => query,
        order: () => query,
        range: () => promise,
        maybeSingle: () => promise,
      });
      return query;
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ sale_id: "sale", idempotent: false }],
      error: null,
    });
    expect(await previewMercadoLibreSale(input)).toMatchObject({ total: 121 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await createMercadoLibreSale(input)).toEqual({
      saleId: "sale",
      idempotent: false,
    });
    expect(mocks.rpc.mock.calls[0][1].p_payload).toMatchObject({
      total_amount: 121,
      items: [
        {
          unit_price: 100,
          base_price: 150,
          taxes: [{ tax_amount: 21 }],
          allocations: [{ lot_id: "lot", quantity: 1 }],
        },
      ],
    });
    expect(mocks.from).not.toHaveBeenCalledWith("pos_payments");
    expect(mocks.from).not.toHaveBeenCalledWith("accounts_receivable");
    await expect(
      createMercadoLibreSale({ ...input, expectedTotal: 120 })
    ).rejects.toThrow("Cambió el total");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("reconciles a lost response without reloading prices, taxes or depleted lots", async () => {
    expect(await createMercadoLibreSale(input)).toEqual({
      saleId: "sale",
      idempotent: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("sales_orders");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_mercadolibre_sale",
      expect.objectContaining({
        p_org_id: "org-id",
        p_actor_id: "actor",
        p_idempotency_key: input.idempotencyKey,
        p_payload: {
          input_fingerprint: expect.stringMatching(FINGERPRINT_PATTERN),
        },
      })
    );
  });
  it("gives equivalent validated inputs the same identity and detects changed prices", async () => {
    await createMercadoLibreSale(input);
    const first = mocks.rpc.mock.calls[0][1].p_payload.input_fingerprint;
    await createMercadoLibreSale({
      ...input,
      receiver: { ...input.receiver, document_number: "12.345.678" },
    });
    expect(mocks.rpc.mock.calls[1][1].p_payload.input_fingerprint).toBe(first);
    await createMercadoLibreSale({
      ...input,
      items: [{ ...input.items[0], unitPrice: 101 }],
    });
    expect(mocks.rpc.mock.calls[2][1].p_payload.input_fingerprint).not.toBe(
      first
    );
  });
  it("does not use elevated access before checking channel permissions", async () => {
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(createMercadoLibreSale(input)).rejects.toThrow("Sin permiso");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("surfaces reconciliation errors without creating a second operation", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "La clave de confirmación ya corresponde a otra solicitud",
      },
    });
    await expect(createMercadoLibreSale(input)).rejects.toThrow(
      "otra solicitud"
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("distinguishes a definite SQL rollback from an uncertain transport error", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Stock insuficiente", code: "P0001" },
    });
    await expect(createMercadoLibreSale(input)).rejects.toMatchObject({
      canEdit: true,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Respuesta no disponible", code: "PGRST000" },
    });
    await expect(createMercadoLibreSale(input)).rejects.toMatchObject({
      canEdit: false,
    });
  });
});
