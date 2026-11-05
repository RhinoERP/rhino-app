import { describe, expect, it } from "vitest";
import {
  MAX_SUPPLIER_INVOICE_PDF_SIZE,
  validateSupplierInvoicePdf,
} from "./supplier-invoice-pdf";

describe("supplier invoice PDF limits", () => {
  it("accepts an optional PDF up to and including 10 MiB", () => {
    expect(validateSupplierInvoicePdf(null)).toBeNull();
    for (const size of [1024, MAX_SUPPLIER_INVOICE_PDF_SIZE]) {
      expect(
        validateSupplierInvoicePdf(
          new File([new Uint8Array(size)], "invoice.pdf", {
            type: "application/pdf",
          })
        )
      ).toBeNull();
    }
  });

  it("rejects a PDF one byte over the limit", () => {
    expect(
      validateSupplierInvoicePdf(
        new File(
          [new Uint8Array(MAX_SUPPLIER_INVOICE_PDF_SIZE + 1)],
          "invoice.pdf",
          { type: "application/pdf" }
        )
      )
    ).toContain("10 MiB");
  });

  it("rejects a non-PDF before upload", () => {
    expect(
      validateSupplierInvoicePdf(
        new File(["image"], "image.png", { type: "image/png" })
      )
    ).toContain("debe ser un PDF");
  });
});
