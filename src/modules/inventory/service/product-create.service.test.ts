import { beforeEach, describe, expect, it, vi } from "vitest";
import { importProducts } from "@/app/org/[orgSlug]/import/actions";
import { createProductAction } from "../actions/product.actions";
import {
  type CreateProductInput,
  createProductForOrg,
} from "./inventory.service";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  single: vi.fn(),
  from: vi.fn(),
  organization: vi.fn(),
  ensure: vi.fn(),
  revalidate: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.organization,
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/excel-parser", () => ({
  parseExcelFile: mocks.parse,
  normalizeData: (rows: unknown) => rows,
}));

const input: CreateProductInput = {
  orgSlug: "safe-dc",
  name: " Boot ",
  sku: " MELI-001 ",
  unit_of_measure: "UN",
};
const product = {
  id: "product-id",
  organization_id: "org-id",
  name: "Boot",
  sku: "MELI-001",
  unit_of_measure: "UN",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.organization.mockResolvedValue({ id: "org-id" });
  mocks.ensure.mockResolvedValue(undefined);
  mocks.rpc.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: product, error: null });
  mocks.from.mockImplementation((table: string) => {
    throw new Error(`Unexpected non-atomic read/write: ${table}`);
  });
});

describe("atomic product creation adapter", () => {
  it("creates a simple product with one RPC and no direct table writes or follow-up reads", async () => {
    expect(await createProductForOrg(input)).toEqual(product);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "create_inventory_product",
      {
        p_org_id: "org-id",
        p_product: expect.objectContaining({
          name: "Boot",
          sku: "MELI-001",
          barcode: "MELI-001",
          has_variants: false,
        }),
        p_variants: [],
      }
    );
    expect(mocks.single).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sends variants and taxes in the same transaction without the legacy lot_id", async () => {
    await createProductForOrg({
      ...input,
      has_variants: true,
      talles: [" M ", "L"],
      colores: [" Azul ", "Rojo"],
      tax_ids: ["iva", "iva", ""],
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "create_inventory_product",
      {
        p_org_id: "org-id",
        p_product: expect.objectContaining({ has_variants: true }),
        p_variants: [
          { talle: "M", color: "Azul" },
          { talle: "M", color: "Rojo" },
          { talle: "L", color: "Azul" },
          { talle: "L", color: "Rojo" },
        ],
        p_tax_ids: ["iva"],
      }
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("preserves a zero explicit price while omission keeps the database default", async () => {
    await createProductForOrg(input);
    expect(mocks.rpc.mock.calls[0][1].p_product).not.toHaveProperty(
      "sale_price"
    );
    await createProductForOrg({ ...input, sale_price: 0 });
    expect(mocks.rpc.mock.calls[1][1].p_product.sale_price).toBe(0);
  });

  it("normalizes optional fields without forwarding caller-controlled identity or lifecycle fields", async () => {
    const request = {
      ...input,
      barcode: " 123 ",
      description: " Description ",
      brand: " ",
      supplier_id: "supplier",
      category_id: "category",
      units_per_box: 0,
      organization_id: "other-org",
      id: "forced-id",
      is_active: false,
    };
    await createProductForOrg(request);
    const payload = mocks.rpc.mock.calls[0][1].p_product;
    expect(payload).toMatchObject({
      barcode: "123",
      description: "Description",
      brand: null,
      units_per_box: null,
      supplier_id: "supplier",
      category_id: "category",
    });
    expect(payload).not.toHaveProperty("organization_id");
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("is_active");
  });

  it.each([
    "KG",
    "LT",
    "UN",
    "MT",
  ] as const)("keeps piece tracking consistent for %s", async (unit) => {
    await createProductForOrg({
      ...input,
      unit_of_measure: unit,
      tracks_stock_units: true,
    });
    expect(mocks.rpc.mock.calls[0][1].p_product.tracks_stock_units).toBe(
      unit === "KG" || unit === "LT"
    );
  });

  it.each([
    { name: " ", sku: "SKU" },
    { name: "Boot", sku: " " },
    { name: "Boot", sku: "SKU", profit_margin: -1 },
    {
      name: "Boot",
      sku: "SKU",
      has_variants: true,
      talles: [],
      colores: ["Azul"],
    },
    {
      name: "Boot",
      sku: "SKU",
      has_variants: true,
      talles: [" "],
      colores: ["Azul"],
    },
  ])("rejects invalid creation input before any database operation: %j", async (invalid) => {
    await expect(
      createProductForOrg({ ...input, ...invalid })
    ).rejects.toThrow();
    expect(mocks.organization).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("bounds combination expansion before allocating or sending oversized variant lists", async () => {
    await expect(
      createProductForOrg({
        ...input,
        has_variants: true,
        talles: Array.from({ length: 101 }, (_, index) => String(index)),
        colores: Array.from({ length: 10 }, (_, index) => `Color ${index}`),
      })
    ).rejects.toThrow("1000");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps a product simple when explicitly configured without variants", async () => {
    await createProductForOrg({
      ...input,
      has_variants: false,
      talles: ["UNICO"],
    });
    expect(mocks.rpc.mock.calls[0][1].p_variants).toEqual([]);
    expect(mocks.rpc.mock.calls[0][1].p_product.has_variants).toBe(false);
  });

  it("reports failed atomic creation without fallback inserts, retries or compensating deletes", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Error al guardar saldos" },
    });
    await expect(
      createProductForOrg({
        ...input,
        has_variants: true,
        talles: ["M"],
        colores: ["Azul"],
      })
    ).rejects.toThrow("Error al guardar saldos");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("preserves the friendly barcode uniqueness error from the database constraint", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key violates products_barcode_org_unique_idx",
      },
    });
    await expect(createProductForOrg(input)).rejects.toThrow(
      'El código de barras "MELI-001" ya está asignado'
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects an absent RPC result instead of reporting a successful creation", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    await expect(createProductForOrg(input)).rejects.toThrow(
      "No se pudo crear el producto"
    );
  });

  it("does not call the RPC when the organization cannot be resolved", async () => {
    mocks.organization.mockResolvedValue(null);
    await expect(createProductForOrg(input)).rejects.toThrow(
      "Organización no encontrada"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("manual and import creation entry points", () => {
  it("keeps the manual permission guard ahead of product creation", async () => {
    mocks.ensure.mockRejectedValue(new Error("denied"));
    await expect(createProductAction(input)).rejects.toThrow("denied");
    expect(mocks.organization).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the atomic adapter in the manual action and revalidates only after success", async () => {
    expect(await createProductAction(input)).toEqual({
      success: true,
      productId: product.id,
    });
    expect(mocks.ensure).toHaveBeenCalledWith("inventory.manage", "safe-dc");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/org/safe-dc/stock");
  });

  it("does not revalidate or return an ID when manual creation fails", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: "Impuesto inválido" },
    });
    expect(await createProductAction(input)).toMatchObject({
      success: false,
      error: expect.stringContaining("Impuesto inválido"),
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("imports valid rows using one atomic RPC each and counts only completed creations", async () => {
    const tables = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      tables(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: table === "suppliers" ? [{ id: "macata", name: "MACATA" }] : [],
          error: null,
        }),
      };
    });
    mocks.parse.mockResolvedValue({
      success: true,
      data: [
        {
          name: "Boot",
          sku: "MELI-001",
          supplier: "MACATA",
          talles: "38,40",
          colores: "Negro",
        },
        {
          name: "Glove",
          sku: "MELI-002",
          supplier: "MACATA",
          talles: "UNICO",
          colores: "",
        },
        {
          name: "Other",
          sku: "MELI-003",
          supplier: "UNKNOWN",
          talles: "M",
          colores: "Azul",
        },
      ],
    });
    mocks.single
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Saldo rechazado" },
      })
      .mockResolvedValueOnce({ data: product, error: null });
    const form = new FormData();
    form.set("file", new File(["fixture"], "products.xlsx"));
    const result = await importProducts(form, "safe-dc");
    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(result.errors).toHaveLength(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][1].p_variants).toEqual([
      { talle: "38", color: "Negro" },
      { talle: "40", color: "Negro" },
    ]);
    expect(mocks.rpc.mock.calls[1][1].p_product.has_variants).toBe(false);
    expect(mocks.rpc.mock.calls[1][1].p_variants).toEqual([]);
    expect(tables.mock.calls.map((call) => call[0]).sort()).toEqual([
      "categories",
      "products",
      "suppliers",
      "taxes",
    ]);
  });
});
