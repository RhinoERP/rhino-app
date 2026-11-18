import { describe, expect, it } from "vitest";
import { buildArcaReceiverDocument } from "@/modules/arca/receiver-document";
import { buildItemizedTaxPlan } from "@/modules/taxes/item-tax-calculations";
import { resolveMeliFiscalReceiver } from "../service/meli-fiscal-receiver";
import { assertMeliFiscalTaxPlan } from "./fiscal-tax-plan";
import {
  defaultMeliInvoiceType,
  meliInvoiceTypesForIssuer,
} from "./invoice-types";

describe("Meli fiscal rules", () => {
  it("offers only issuer-compatible invoice types without changing POS rules", () => {
    expect(meliInvoiceTypesForIssuer("IVA Responsable Inscripto")).toEqual([
      "FACTURA_A",
      "FACTURA_B",
    ]);
    expect(meliInvoiceTypesForIssuer("Monotributista")).toEqual(["FACTURA_C"]);
    expect(meliInvoiceTypesForIssuer(null)).toEqual([]);
    expect(defaultMeliInvoiceType(["FACTURA_C"], "RESPONSABLE_INSCRIPTO")).toBe(
      "FACTURA_C"
    );
    expect(
      defaultMeliInvoiceType(["FACTURA_A", "FACTURA_B"], "CONSUMIDOR_FINAL")
    ).toBe("FACTURA_B");
  });
  it("represents an occasional receiver without inventing a customer ID or CUIT", () => {
    const receiver = resolveMeliFiscalReceiver(
      {
        version: 1,
        tax_condition: "CONSUMIDOR_FINAL",
        document_type: "DNI",
        document_number: "12345678",
        first_name: "Ana",
        last_name: "Pérez",
        address: "Calle 123",
      },
      null
    );
    expect(receiver).toMatchObject({
      id: null,
      cuit: null,
      businessName: "Ana Pérez",
      document: { type: "DNI", number: "12345678" },
    });
    expect(
      buildArcaReceiverDocument({
        customerCuit: null,
        customerTaxCondition: receiver.taxCondition,
        invoiceType: "FACTURA_B",
        totalAmount: 121,
        receiverDocument: receiver.document,
      })
    ).toEqual({ documentType: 96, documentNumber: 12_345_678 });
    expect(() =>
      buildArcaReceiverDocument({
        customerCuit: null,
        customerTaxCondition: receiver.taxCondition,
        invoiceType: "FACTURA_A",
        totalAmount: 121,
        receiverDocument: receiver.document,
      })
    ).toThrow("DNI");
  });
  it("keeps the existing unidentified-CF behavior when no explicit document is supplied", () => {
    expect(
      buildArcaReceiverDocument({
        customerCuit: null,
        customerTaxCondition: "CONSUMIDOR_FINAL",
        invoiceType: "FACTURA_B",
        totalAmount: 121,
      })
    ).toEqual({ documentType: 99, documentNumber: 0 });
  });
  it("rejects missing VAT coverage and C with VAT before recording stock", () => {
    const none = buildItemizedTaxPlan({
      lines: [{ lineId: "line", productId: "product", netAmount: 100 }],
      globalDiscountAmount: 0,
    });
    expect(() => assertMeliFiscalTaxPlan("FACTURA_B", none, 100)).toThrow(
      "Configurá IVA"
    );
    expect(() => assertMeliFiscalTaxPlan("FACTURA_C", none, 100)).not.toThrow();
    const vat = buildItemizedTaxPlan({
      lines: [
        {
          lineId: "line",
          productId: "product",
          netAmount: 100,
          taxes: [
            { taxId: "vat", name: "IVA", rate: 21, taxCodeSnapshot: "IVA_21" },
          ],
        },
      ],
      globalDiscountAmount: 0,
    });
    expect(() => assertMeliFiscalTaxPlan("FACTURA_A", vat, 121)).not.toThrow();
    expect(() => assertMeliFiscalTaxPlan("FACTURA_C", vat, 121)).toThrow(
      "Factura C"
    );
    const inconsistent = buildItemizedTaxPlan({
      lines: [
        {
          lineId: "line",
          productId: "product",
          netAmount: 100,
          taxes: [
            { taxId: "vat", name: "IVA", rate: 27, taxCodeSnapshot: "IVA_21" },
          ],
        },
      ],
      globalDiscountAmount: 0,
    });
    expect(() =>
      assertMeliFiscalTaxPlan("FACTURA_A", inconsistent, 127)
    ).toThrow("alícuota IVA");
  });
});
