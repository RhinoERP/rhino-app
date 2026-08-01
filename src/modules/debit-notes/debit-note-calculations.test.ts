import { describe, expect, it } from "vitest";
import { calculateDebitNoteBreakdown } from "./debit-note-calculations";

const DESCRIPTION_ERROR = /descripción/;

describe("calculateDebitNoteBreakdown", () => {
  it("calcula y agrega IVA y tributos por ítem con redondeo monetario", () => {
    const result = calculateDebitNoteBreakdown([
      {
        description: "Interés",
        quantity: 1,
        unitPrice: 100.01,
        taxes: [
          {
            taxId: "iva",
            name: "IVA 21%",
            rate: 21,
            taxCodeSnapshot: "IVA_21",
          },
        ],
      },
      {
        description: "Cargo",
        quantity: 2,
        unitPrice: 50,
        taxes: [
          {
            taxId: "iva",
            name: "IVA 21%",
            rate: 21,
            taxCodeSnapshot: "IVA_21",
          },
          { taxId: "iibb", name: "IIBB", rate: 3, taxCodeSnapshot: "IIBB" },
        ],
      },
    ]);

    expect(result.netAmount).toBe(200.01);
    expect(result.taxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "IVA 21%",
          baseAmount: 200.01,
          taxAmount: 42,
        }),
        expect.objectContaining({
          name: "IIBB",
          baseAmount: 100,
          taxAmount: 3,
        }),
      ])
    );
    expect(result.totalAmount).toBe(245.01);
  });

  it("rechaza ítems sin descripción o cantidad válida", () => {
    expect(() =>
      calculateDebitNoteBreakdown([
        { description: "", quantity: 0, unitPrice: 10 },
      ])
    ).toThrow(DESCRIPTION_ERROR);
  });
});
