import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createVariantsWithInitialBalances } from "./variant-balances.service";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertVariants: vi.fn(),
  selectVariants: vi.fn(),
  insertLots: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

async function createBalances(combinations = [{ talle: "M", color: "Azul" }]) {
  return createVariantsWithInitialBalances({
    supabase: await createClient(),
    orgId: "org-a",
    productId: "product-a",
    warehouseId: "warehouse-a",
    combinations,
  });
}

describe("creación de variantes y saldos independientes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockImplementation((table: string) =>
      table === "product_variants"
        ? { insert: mocks.insertVariants }
        : { insert: mocks.insertLots }
    );
    mocks.insertVariants.mockReturnValue({ select: mocks.selectVariants });
    mocks.selectVariants.mockResolvedValue({
      data: [{ id: "variant-a" }],
      error: null,
    });
    mocks.insertLots.mockResolvedValue({ error: null });
  });

  it("crea saldos por variante y depósito sin escribir el lot_id legacy", async () => {
    mocks.selectVariants.mockResolvedValue({
      data: [{ id: "variant-b" }, { id: "variant-a" }],
      error: null,
    });
    await createBalances([
      { talle: "M", color: "Azul" },
      { talle: "L", color: "Rojo" },
    ]);

    expect(mocks.insertVariants).toHaveBeenCalledWith([
      {
        organization_id: "org-a",
        product_id: "product-a",
        talle: "M",
        color: "Azul",
      },
      {
        organization_id: "org-a",
        product_id: "product-a",
        talle: "L",
        color: "Rojo",
      },
    ]);
    expect(mocks.insertLots).toHaveBeenCalledWith(
      ["variant-b", "variant-a"].map((id) => ({
        organization_id: "org-a",
        product_id: "product-a",
        warehouse_id: "warehouse-a",
        product_variant_id: id,
        lot_number: "DEFAULT",
        expiration_date: null,
        quantity_available: 0,
        unit_quantity_available: 0,
      }))
    );
  });

  it("no escribe cuando no hay combinaciones nuevas", async () => {
    await createBalances([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("no crea saldos si falla la creación del catálogo", async () => {
    mocks.selectVariants.mockResolvedValue({
      data: null,
      error: { message: "variante duplicada" },
    });
    await expect(createBalances()).rejects.toThrow("variante duplicada");
    expect(mocks.insertLots).not.toHaveBeenCalled();
  });

  it("rechaza una respuesta incompleta antes de crear saldos", async () => {
    mocks.selectVariants.mockResolvedValue({ data: [], error: null });
    await expect(createBalances()).rejects.toThrow("faltan variantes creadas");
    expect(mocks.insertLots).not.toHaveBeenCalled();
  });

  it("propaga el error de creación de saldos", async () => {
    mocks.insertLots.mockResolvedValue({
      error: { message: "depósito inválido" },
    });
    await expect(createBalances()).rejects.toThrow("depósito inválido");
  });
});
