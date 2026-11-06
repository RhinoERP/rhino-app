import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import { getPayableInvoiceDocuments } from "./payable-documents.service";

describe("payable invoice document retrieval", () => {
  it("keeps fetching past a smaller server cap and scopes each batch to the requested APs", async () => {
    const ids = Array.from(
      { length: 102 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const url = new URL(String(input));
      const filter = url.searchParams.get("account_payable_id") ?? "";
      const batch = filter.slice(4, -1).split(",");
      const offset = Number(url.searchParams.get("offset"));
      expect(JSON.parse(String(init?.body)).p_org_id).toBe("org");
      expect(url.searchParams.get("order")).toBe("account_payable_id.asc");
      expect(batch.length).toBeLessThanOrEqual(100);
      expect(batch.every((id) => ids.includes(id))).toBe(true);
      return Promise.resolve(
        Response.json(
          batch
            .slice(offset, offset + 7)
            .map((id) => ({ account_payable_id: id }))
        )
      );
    });
    const supabase = createClient<Database>(
      "http://localhost:54321",
      "fixture",
      {
        global: { fetch: fetcher },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const result = await getPayableInvoiceDocuments(supabase, "org", [
      ...ids,
      ids[0],
    ]);
    expect(result.map((document) => document.account_payable_id)).toEqual(ids);
    expect(fetcher).toHaveBeenCalledTimes(18);
  });

  it("does not request the organization's documents for an empty selection", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const supabase = createClient<Database>(
      "http://localhost:54321",
      "fixture",
      {
        global: { fetch: fetcher },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    expect(await getPayableInvoiceDocuments(supabase, "org", [])).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
