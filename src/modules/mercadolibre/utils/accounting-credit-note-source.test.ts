import { describe, expect, it } from "vitest";
import { assertMeliCreditNoteFiscalSource } from "./accounting-credit-note-source";

const invoice = {
  arca_status: "authorized",
  arca_cae: "123",
  arca_point_of_sale: 1,
  arca_voucher_type_code: 6,
  arca_voucher_number: 42,
};
const associated = { Tipo: 6, PtoVta: 1, Nro: 42 };
const note = {
  invoice_type: "FACTURA_B",
  arca_voucher_type_code: 8,
  arca_associated_voucher_type_code: 6,
  arca_associated_point_of_sale: 1,
  arca_associated_voucher_number: 42,
  arca_request_json: { wsfeRequest: { CbtesAsoc: [associated] } },
};

describe("Meli credit note fiscal source", () => {
  it("accepts a verified note associated with its authorized invoice", () => {
    expect(() => assertMeliCreditNoteFiscalSource(invoice, note)).not.toThrow();
  });

  it("rejects unverified invoice and inconsistent note or association", () => {
    for (const [sale, creditNote] of [
      [{ ...invoice, arca_status: "pending" }, note],
      [invoice, { ...note, arca_voucher_type_code: 3 }],
      [invoice, { ...note, arca_associated_voucher_number: 43 }],
      [
        invoice,
        {
          ...note,
          arca_request_json: {
            wsfeRequest: { CbtesAsoc: [{ ...associated, Nro: 43 }] },
          },
        },
      ],
      [
        invoice,
        {
          ...note,
          arca_request_json: {
            wsfeRequest: { CbtesAsoc: [associated, associated] },
          },
        },
      ],
      [invoice, { ...note, arca_request_json: null }],
    ]) {
      expect(() =>
        assertMeliCreditNoteFiscalSource(sale, creditNote)
      ).toThrow();
    }
  });
});
