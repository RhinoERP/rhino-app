import { describe, expect, it } from "vitest";
import {
  buildRemittanceFromSale,
  generateRemittanceHTML,
} from "./remittance-generator.service";

function saleWithArcaStatus(arcaStatus: string, invoiceNumber: string | null) {
  return {
    arca_status: arcaStatus,
    invoice_number: invoiceNumber,
    remittance_number: "R-0001",
    sale_number: 1,
    sale_date: "2026-08-12",
    expiration_date: null,
    customer: {
      business_name: "Cliente",
      fantasy_name: null,
      cuit: null,
      phone: null,
      address: null,
      city: null,
      delivery_address: null,
      delivery_city: null,
      tax_condition: null,
    },
    seller: null,
    items: [],
    taxes: [],
    global_discount_amount: 0,
    observations: null,
  } as unknown as Parameters<typeof buildRemittanceFromSale>[0];
}

describe("remittance invoice reference", () => {
  it("shows the ARCA invoice number on an authorized sale remittance", () => {
    const data = buildRemittanceFromSale(
      saleWithArcaStatus("authorized", "0001-00000042"),
      "REMITO_FINAL"
    );

    expect(data.invoiceNumber).toBe("0001-00000042");
    expect(generateRemittanceHTML(data)).toContain(
      "Factura:</span> 0001-00000042"
    );
  });

  it.each([
    "not_requested",
    "pending",
    "error",
  ])("hides an invoice number unless ARCA is authorized (%s)", (arcaStatus) => {
    const data = buildRemittanceFromSale(
      saleWithArcaStatus(arcaStatus, "MANUAL-42"),
      "REMITO_FINAL"
    );

    expect(data.invoiceNumber).toBeUndefined();
    expect(generateRemittanceHTML(data)).not.toContain("Factura:</span>");
  });
});
