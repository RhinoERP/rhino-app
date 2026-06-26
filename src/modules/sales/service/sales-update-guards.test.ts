import { describe, expect, it } from "vitest";
import { getAuthorizedSaleFiscalUpdateFields } from "./sales-update-guards";

describe("getAuthorizedSaleFiscalUpdateFields", () => {
  it("permite actualizaciones internas en ventas ARCA autorizadas", () => {
    expect(
      getAuthorizedSaleFiscalUpdateFields({
        orgSlug: "demo",
        saleId: "sale-1",
        observations: "Nota interna",
        remittanceNumber: "R-1",
      })
    ).toEqual([]);
  });

  it("detecta campos fiscales aunque el valor sea vacio", () => {
    expect(
      getAuthorizedSaleFiscalUpdateFields({
        orgSlug: "demo",
        saleId: "sale-1",
        customerId: "customer-1",
        sellerId: "seller-1",
        items: [],
        taxes: [],
        invoiceNumber: null,
      })
    ).toEqual(["customerId", "sellerId", "invoiceNumber", "items", "taxes"]);
  });
});
