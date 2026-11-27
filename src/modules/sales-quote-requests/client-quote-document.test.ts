import { describe, expect, it } from "vitest";
import { renderClientQuoteHTML } from "./client-quote-document";

describe("client quote PDF document", () => {
  it("escapes user content, shows taxes and marks the quote as provisional", () => {
    const html = renderClientQuoteHTML({
      organizationName: "Empresa",
      customerName: "<cliente>",
      preparedOn: "27/11/2026",
      currency: "ARS",
      paymentMethod: "Transferencia",
      paymentTerm: "",
      observations: "<script>alert(1)</script>",
      lines: [
        {
          name: "Caja",
          quantityLabel: "6 unidades",
          quantity: 6,
          unitPrice: 10,
          subtotal: 60,
        },
      ],
      taxes: [{ name: "IVA", rate: 21, taxAmount: 12.6 }],
      additionalTaxes: [],
      subtotal: 60,
      taxAmount: 12.6,
      total: 72.6,
    });
    expect(html).toContain("&lt;cliente&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("IVA (21%)");
    expect(html).toContain("aprobación interna");
  });
});
