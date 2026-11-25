import { describe, expect, it } from "vitest";
import {
  getAuthorizedSaleFiscalUpdateFields,
  shouldUpdateSaleWarehouse,
} from "./sales-update-guards";

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

  it("bloquea cambios de cotización comercial en ventas autorizadas", () => {
    expect(
      getAuthorizedSaleFiscalUpdateFields({
        orgSlug: "demo",
        saleId: "sale-1",
        commercialExchangeRate: 1535,
      })
    ).toContain("commercialExchangeRate");
  });

  it("no actualiza el depósito cuando no se envía o es el mismo", () => {
    expect(
      shouldUpdateSaleWarehouse({
        status: "DRAFT",
        currentWarehouseId: "warehouse-a",
        requestedWarehouseId: undefined,
      })
    ).toBe(false);
    expect(
      shouldUpdateSaleWarehouse({
        status: "DRAFT",
        currentWarehouseId: "warehouse-a",
        requestedWarehouseId: "warehouse-a",
      })
    ).toBe(false);
  });

  it("permite cambiar el depósito solo en preventas en borrador", () => {
    expect(
      shouldUpdateSaleWarehouse({
        status: "DRAFT",
        currentWarehouseId: "warehouse-a",
        requestedWarehouseId: "warehouse-b",
      })
    ).toBe(true);

    expect(() =>
      shouldUpdateSaleWarehouse({
        status: "CONFIRMED",
        currentWarehouseId: "warehouse-a",
        requestedWarehouseId: "warehouse-b",
      })
    ).toThrow("Solo se puede cambiar el depósito");
  });
});
