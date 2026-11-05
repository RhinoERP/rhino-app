import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import { resolvePayableExchangeRate } from "./payment-rate";

function fixture(
  rows: { exchange_rate: number; currency: string; status?: string }[]
) {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(rows));
  const supabase = createClient<Database>(
    "http://localhost:54321",
    "fixture-key",
    {
      global: { fetch: fetcher },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  return { fetcher, supabase };
}
const payable = {
  currency: "USD",
  supplier_id: "supplier",
  purchase_order_id: "order",
  exchange_rate: null,
};
describe("payable frozen invoice rate", () => {
  it("selects the direct invoice ID instead of another invoice of an OC", async () => {
    const { supabase, fetcher } = fixture([
      { exchange_rate: 1234, currency: "USD", status: "REGISTERED" },
    ]);
    expect(
      await resolvePayableExchangeRate({
        supabase,
        orgId: "org",
        payable: { ...payable, supplier_invoice_id: "invoice" },
      })
    ).toBe(1234);
    const request = String(fetcher.mock.calls[0]?.[0]);
    expect(request).toContain("id=eq.invoice");
    expect(request).not.toContain("purchase_order_id=");
  });
  it("rejects incompatible rates in a consolidated legacy account", async () => {
    const { supabase } = fixture([
      { exchange_rate: 1000, currency: "USD" },
      { exchange_rate: 1200, currency: "USD" },
    ]);
    expect(
      await resolvePayableExchangeRate({ supabase, orgId: "org", payable })
    ).toBeNull();
  });
  it("accepts a single compatible legacy rate", async () => {
    const { supabase } = fixture([
      { exchange_rate: 1000, currency: "USD" },
      { exchange_rate: 1000, currency: "USD" },
    ]);
    expect(
      await resolvePayableExchangeRate({ supabase, orgId: "org", payable })
    ).toBe(1000);
  });
  it("does not convert an ARS invoice even if an old rate remains in the input", async () => {
    const { supabase, fetcher } = fixture([]);
    expect(
      await resolvePayableExchangeRate({
        supabase,
        orgId: "org",
        payable: { ...payable, currency: "ARS", exchange_rate: 1200 },
      })
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
