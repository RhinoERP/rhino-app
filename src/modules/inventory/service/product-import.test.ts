import { beforeEach, describe, expect, it, vi } from "vitest";
import { importProducts } from "@/app/org/[orgSlug]/import/actions";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  ensure: vi.fn(),
  create: vi.fn(),
  from: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/excel-parser", () => ({
  parseExcelFile: mocks.parse,
  normalizeData: (data: unknown) => data,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org" }),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("./inventory.service", () => ({ createProductForOrg: mocks.create }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const row = {
  name: "Boot",
  sku: "MELI-001",
  supplier: "MACATA",
  talles: "38,40",
  colores: "Negro",
};

function references(
  options: {
    suppliers?: { id: string; name: string }[];
    products?: { sku: string; supplier_id: string | null; barcode: string }[];
    supplierError?: boolean;
  } = {}
) {
  const ranges = vi.fn();
  mocks.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn((from: number, to: number) => {
      ranges(table, from, to);
      if (table === "suppliers" && options.supplierError) {
        return Promise.resolve({
          data: null,
          error: { message: "unavailable" },
        });
      }
      const sources: Record<string, unknown[]> = {
        suppliers: options.suppliers ?? [{ id: "macata", name: "MACATA" }],
        products: options.products ?? [],
      };
      const data = sources[table] ?? [];
      return Promise.resolve({ data: data.slice(from, to + 1), error: null });
    }),
  }));
  return ranges;
}

function run(rows: Record<string, unknown>[]) {
  mocks.parse.mockResolvedValue({ success: true, data: rows });
  const form = new FormData();
  form.set("file", new File(["fixture"], "products.xlsx"));
  return importProducts(form, "safe-dc");
}

describe("product import row validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ensure.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ id: "product" });
    references();
  });

  it("validates inventory.manage before parsing or querying reference data", async () => {
    mocks.ensure.mockRejectedValue(new Error("denied"));
    await expect(run([row])).rejects.toThrow("denied");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects unknown suppliers before calling the product creation service", async () => {
    const result = await run([{ ...row, supplier: "LIQUIDACION" }]);
    expect(result).toMatchObject({ success: false, imported: 0 });
    expect(result.errors?.[0]).toContain('proveedor "LIQUIDACION" no existe');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects ambiguous suppliers", async () => {
    references({
      suppliers: [
        { id: "a", name: "MACATA" },
        { id: "b", name: "Macata " },
      ],
    });
    expect((await run([row])).errors?.[0]).toContain("ambiguo");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("imports simple products with a single dimension instead of forcing incomplete variants", async () => {
    const result = await run([{ ...row, colores: "" }]);
    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        has_variants: false,
        supplier_id: "macata",
        talles: undefined,
        colores: undefined,
      })
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/org/safe-dc/stock");
  });

  it("preserves an intentionally empty supplier", async () => {
    expect((await run([{ ...row, supplier: "" }])).imported).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ supplier_id: undefined })
    );
  });

  it("passes text size lists to the shared creation service without decimal conversion", async () => {
    expect((await run([{ ...row, talles: "0,1" }])).imported).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        has_variants: true,
        talles: ["0", "1"],
        colores: ["Negro"],
      })
    );
  });

  it("rejects lossy numeric sizes before inserting products", async () => {
    const result = await run([{ ...row, talles: 0.1 }]);
    expect(result.imported).toBe(0);
    expect(result.errors?.[0]).toContain("texto");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports completed rows and row failures separately", async () => {
    const result = await run([
      row,
      { ...row, sku: "MELI-002", supplier: "UNKNOWN" },
    ]);
    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(result.message).toContain("1 de 2");
    expect(result.message).toContain("Filas no importadas: 1");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("does not count a rejected creation as a successful row", async () => {
    mocks.create.mockRejectedValue(new Error("atomic creation failed"));
    expect(await run([row])).toMatchObject({ success: false, imported: 0 });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("aborts before writes when reference data cannot be fetched", async () => {
    references({ supplierError: true });
    expect((await run([row])).success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("resolves an existing supplier beyond the first 1000 database rows", async () => {
    const suppliers = Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      name: `Other ${index}`,
    }));
    const ranges = references({
      suppliers: [...suppliers, { id: "macata", name: "MACATA" }],
    });
    expect((await run([row])).imported).toBe(1);
    expect(ranges).toHaveBeenCalledWith("suppliers", 1000, 1999);
  });

  it("recognizes an existing SKU beyond the first 1000 catalogue entries", async () => {
    const products = Array.from({ length: 1000 }, (_, index) => ({
      sku: `OTHER-${index}`,
      supplier_id: "macata",
      barcode: `OTHER-${index}`,
    }));
    references({
      products: [
        ...products,
        { sku: row.sku, supplier_id: "macata", barcode: row.sku },
      ],
    });
    const result = await run([row]);
    expect(result.imported).toBe(0);
    expect(result.errors?.[0]).toContain("ya existe");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
