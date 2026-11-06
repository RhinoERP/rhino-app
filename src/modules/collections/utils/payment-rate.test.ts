import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/supabase";
import {
  resolvePayableExchangeRate,
  resolveReceivableExchangeRate,
} from "./payment-rate";

function fixture(rows: Record<string, unknown>[]) {
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

describe("receivable document exchange rate", () => {
  const receivable = { currency: "USD", sales_order_id: "sale" };
  const sale = {
    arca_status: "not_requested",
    invoice_type: "NOTA_DE_VENTA",
    invoice_number: null,
    commercial_exchange_rate: 1200.123_456,
    exchange_rate: 999,
    commercial_snapshot: null,
    arca_request_json: null,
    arca_authorized_at: null,
  };
  function rate(row: Record<string, unknown>) {
    const { supabase } = fixture([row]);
    return resolveReceivableExchangeRate({
      supabase,
      orgId: "org",
      receivable,
    });
  }
  it("uses the agreed commercial rate for an uninvoiced sale, never the fiscal field", async () => {
    expect(await rate(sale)).toBe(1200.123_456);
    expect(await rate({ ...sale, commercial_exchange_rate: null })).toBeNull();
  });
  it("recovers an agreed quote snapshot without consulting a live quote", async () => {
    expect(
      await rate({
        ...sale,
        commercial_exchange_rate: null,
        commercial_snapshot: { exchangeRate: 1234 },
      })
    ).toBe(1234);
  });
  it("uses the authorized voucher over a conflicting cached rate", async () => {
    expect(
      await rate({
        ...sale,
        arca_status: "authorized",
        arca_request_json: {
          wsfeRequest: { MonId: "DOL", MonCotiz: 1250.123_456 },
        },
      })
    ).toBe(1250.123_456);
  });
  it("never substitutes the commercial rate of a fiscal invoice missing its fiscal rate", async () => {
    expect(
      await rate({ ...sale, arca_status: "authorized", exchange_rate: null })
    ).toBeNull();
  });
  it("supports externally registered invoices without an ARCA snapshot", async () => {
    expect(
      await rate({
        ...sale,
        invoice_type: "FACTURA_A",
        invoice_number: "0001-1",
        exchange_rate: 1250,
      })
    ).toBe(1250);
  });
  it("preserves a commercial collection predating authorization, but uses the fiscal rate for new collections", async () => {
    const { supabase } = fixture([
      {
        ...sale,
        arca_status: "authorized",
        exchange_rate: 1500,
        arca_authorized_at: "2026-11-06T12:00:00Z",
      },
    ]);
    expect(
      await resolveReceivableExchangeRate({
        supabase,
        orgId: "org",
        receivable,
        existingPayment: {
          exchange_rate: 1200,
          created_at: "2026-11-05T12:00:00Z",
        },
      })
    ).toBe(1200);
    expect(
      await resolveReceivableExchangeRate({
        supabase,
        orgId: "org",
        receivable,
      })
    ).toBe(1500);
  });
  it("resolves authorized manual invoices without a sales order", async () => {
    const { supabase, fetcher } = fixture([
      {
        currency: "USD",
        status: "authorized",
        exchange_rate: 1250,
        arca_request_json: { wsfeRequest: { MonId: "DOL", MonCotiz: 1300 } },
      },
    ]);
    expect(
      await resolveReceivableExchangeRate({
        supabase,
        orgId: "org",
        receivable: {
          ...receivable,
          sales_order_id: null,
          manual_fiscal_invoice_id: "manual",
        },
      })
    ).toBe(1300);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "manual_fiscal_invoices"
    );
  });
  it("preserves a collection preceding external invoice registration", async () => {
    const { supabase } = fixture([
      {
        ...sale,
        invoice_type: "FACTURA_A",
        invoice_number: "0001-1",
        exchange_rate: 1500,
        arca_request_json: { fiscalRateConfirmedAt: "2026-11-06T12:00:00Z" },
      },
    ]);
    expect(
      await resolveReceivableExchangeRate({
        supabase,
        orgId: "org",
        receivable,
        existingPayment: {
          exchange_rate: 1200,
          created_at: "2026-11-05T12:00:00Z",
        },
      })
    ).toBe(1200);
  });
  it("does not charge draft manual invoices", async () => {
    const { supabase } = fixture([
      { currency: "USD", status: "draft", exchange_rate: 1250 },
    ]);
    expect(
      await resolveReceivableExchangeRate({
        supabase,
        orgId: "org",
        receivable: {
          ...receivable,
          sales_order_id: null,
          manual_fiscal_invoice_id: "manual",
        },
      })
    ).toBeNull();
  });
});

it("does not trust an AP cached rate over a cancelled linked invoice", async () => {
  const { supabase } = fixture([
    { currency: "USD", status: "CANCELLED", exchange_rate: 1300 },
  ]);
  expect(
    await resolvePayableExchangeRate({
      supabase,
      orgId: "org",
      payable: {
        ...payable,
        supplier_invoice_id: "invoice",
        exchange_rate: 1200,
      },
    })
  ).toBeNull();
});
