import { describe, expect, it, vi } from "vitest";
import type { createClient } from "@/lib/supabase/server";
import {
  isInvoiceBackedDebtEnabled,
  requiresFiscalInvoiceForSaleDebt,
} from "./debt-policy.service";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function client(settings: unknown, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: settings === undefined ? null : { settings },
    error,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  // The mock implements only the settings query used by this service.
  return { supabase: { from } as unknown as Supabase, from, eq };
}

describe("organization debt policy", () => {
  it.each([
    undefined,
    null,
    {},
    [],
    { invoice_backed_debt_enabled: false },
  ])("preserves operational debt for organizations without explicit opt-in (%j)", async (settings) => {
    const { supabase } = client(settings);
    await expect(isInvoiceBackedDebtEnabled(supabase, "tenant")).resolves.toBe(
      false
    );
  });

  it("loads the requested tenant policy", async () => {
    const { supabase, from, eq } = client({
      invoice_backed_debt_enabled: true,
    });
    await expect(isInvoiceBackedDebtEnabled(supabase, "tenant")).resolves.toBe(
      true
    );
    expect(from).toHaveBeenCalledWith("organization_settings");
    expect(eq).toHaveBeenCalledWith("organization_id", "tenant");
  });

  it("does not fall back to provisional debt when the policy cannot be read", async () => {
    const { supabase } = client(undefined, { message: "Database unavailable" });
    await expect(
      isInvoiceBackedDebtEnabled(supabase, "tenant")
    ).rejects.toThrow("Database unavailable");
  });
});

describe("sale debt policy exception", () => {
  function saleClient(
    invoiceType: string,
    error: { message: string } | null = null
  ) {
    const settings = client({ invoice_backed_debt_enabled: true });
    const single = vi.fn().mockResolvedValue({
      data: error ? null : { invoice_type: invoiceType },
      error,
    });
    const eq = vi.fn();
    eq.mockReturnValue({ eq, single });
    settings.from.mockImplementation((table: string) => {
      if (table === "sales_orders") {
        return { select: vi.fn().mockReturnValue({ eq }) };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { settings: { invoice_backed_debt_enabled: true } },
              error: null,
            }),
          }),
        }),
      };
    });
    return { ...settings, eq };
  }

  it("retains operational debt without reading a sale when the policy is off", async () => {
    const { supabase, from } = client({ invoice_backed_debt_enabled: false });
    await expect(
      requiresFiscalInvoiceForSaleDebt(supabase, "tenant", "sale")
    ).resolves.toBe(false);
    expect(from).not.toHaveBeenCalledWith("sales_orders");
  });

  it("allows notes and their informal advances without fiscal authorization", async () => {
    const { supabase, eq } = saleClient("NOTA_DE_VENTA");
    await expect(
      requiresFiscalInvoiceForSaleDebt(supabase, "tenant", "sale")
    ).resolves.toBe(false);
    expect(eq).toHaveBeenCalledWith("organization_id", "tenant");
    expect(eq).toHaveBeenCalledWith("id", "sale");
  });

  it.each([
    "FACTURA_A",
    "FACTURA_B",
    "FACTURA_C",
    "FACTURA_E",
  ])("still requires an invoice for %s", async (invoiceType) => {
    const { supabase } = saleClient(invoiceType);
    await expect(
      requiresFiscalInvoiceForSaleDebt(supabase, "tenant", "sale")
    ).resolves.toBe(true);
  });

  it("does not assume a note when the sale cannot be loaded", async () => {
    const { supabase } = saleClient("NOTA_DE_VENTA", {
      message: "Unavailable",
    });
    await expect(
      requiresFiscalInvoiceForSaleDebt(supabase, "tenant", "sale")
    ).rejects.toThrow("Unavailable");
  });
});
