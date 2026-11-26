import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import {
  assertCaseQuantity,
  getTransactionProductUnits,
} from "./transaction-units.service";

function client(products: unknown[]) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: products, error: null }),
  };
  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>,
  };
}

describe("transaction product units", () => {
  it("loads canonical metadata once per product and scopes it to the organization", async () => {
    const { supabase, query } = client([
      { id: "p1", unit_of_measure: "CAJA", units_per_box: 6 },
    ]);
    const products = await getTransactionProductUnits(supabase, "org", [
      "p1",
      "p1",
    ]);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(query.in).toHaveBeenCalledWith("id", ["p1"]);
    expect(products.get("p1")?.units_per_box).toBe(6);
  });

  it("rejects unknown or cross-organization products instead of falling back to caller metadata", async () => {
    const { supabase } = client([]);
    await expect(
      getTransactionProductUnits(supabase, "org", ["foreign"])
    ).rejects.toThrow("esta organización");
  });

  it.each([
    null,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects an invalid canonical box factor: %s", async (factor) => {
    const { supabase } = client([
      { id: "p1", unit_of_measure: "CAJA", units_per_box: factor },
    ]);
    await expect(
      getTransactionProductUnits(supabase, "org", ["p1"])
    ).rejects.toThrow("factor de empaque");
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid individual-unit counts: %s", (quantity) => {
    expect(() => assertCaseQuantity(quantity)).toThrow("unidades enteras");
  });
});
