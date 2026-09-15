import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { manualFiscalInvoiceSchema } from "./manual-fiscal-invoices.service";

const base = {
  orgSlug: "acme",
  customerId: "00000000-0000-4000-8000-000000000001",
  issueDate: "2026-09-15",
  invoiceType: "FACTURA_B" as const,
  currency: "ARS" as const,
  items: [
    {
      description: "Comisión comercial",
      quantity: 1,
      unitPrice: 1000,
      ivaRate: 21 as const,
    },
  ],
};

describe("manualFiscalInvoiceSchema", () => {
  it("accepts a service invoice with free detail and IVA", () => {
    expect(manualFiscalInvoiceSchema.safeParse(base).success).toBe(true);
  });

  it("requires an exchange rate for USD", () => {
    expect(
      manualFiscalInvoiceSchema.safeParse({ ...base, currency: "USD" }).success
    ).toBe(false);
    expect(
      manualFiscalInvoiceSchema.safeParse({
        ...base,
        currency: "USD",
        exchangeRate: 1250.5,
      }).success
    ).toBe(true);
  });
});
