import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { assertWholesaleWarehouseForOrganization } from "@/modules/inventory/service/warehouse-stock.service";
import { getQuoteItemsWarehouseId } from "./order-warehouse.service";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mocks.from }),
}));
vi.mock("@/modules/inventory/service/warehouse-stock.service", () => ({
  assertWholesaleWarehouseForOrganization: mocks.access,
}));

function queryResult(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("depósito canónico de ítems de pedido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(undefined);
  });

  async function resolve() {
    return getQuoteItemsWarehouseId({
      supabase: await createClient(),
      orgId: "org-a",
      quoteItemIds: ["item-a", "item-b"],
    });
  }

  function setRows(warehouses: string[]) {
    mocks.from.mockReturnValueOnce(
      queryResult([
        { id: "item-a", quote_id: "quote-a" },
        { id: "item-b", quote_id: "quote-b" },
      ])
    );
    const quotes = queryResult(
      warehouses.map((warehouse_id) => ({ warehouse_id }))
    );
    mocks.from.mockReturnValueOnce(quotes);
    return quotes;
  }

  it("resuelve el depósito persistido y comprueba organización y acceso", async () => {
    const quotes = setRows(["branch", "branch"]);
    await expect(resolve()).resolves.toBe("branch");
    expect(quotes.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(assertWholesaleWarehouseForOrganization).toHaveBeenCalledWith(
      expect.anything(),
      "org-a",
      "branch"
    );
  });

  it("rechaza mezclar ítems de depósitos diferentes", async () => {
    setRows(["principal", "branch"]);
    await expect(resolve()).rejects.toThrow("mismo depósito");
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("rechaza presupuestos que el filtro de organización no devuelve", async () => {
    setRows([]);
    await expect(resolve()).rejects.toThrow("no pertenecen");
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("rechaza ítems inexistentes en lugar de usar stock global", async () => {
    mocks.from.mockReturnValueOnce(queryResult([]));
    await expect(resolve()).rejects.toThrow("identificar");
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("propaga la revocación de acceso sin elegir otro depósito", async () => {
    setRows(["branch", "branch"]);
    mocks.access.mockRejectedValueOnce(new Error("Acceso revocado"));
    await expect(resolve()).rejects.toThrow("Acceso revocado");
  });
});
