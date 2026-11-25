import { describe, expect, it } from "vitest";
import { resolveCreditNoteFiscalBreakdown } from "./credit-note-fiscal-breakdown";

const note = {
  salesOrderId: "sale",
  arcaStatus: "authorized",
  amount: 662_394.22,
  arcaPointOfSale: 2,
  arcaVoucherTypeCode: 3,
  arcaVoucherNumber: 4,
  arcaCae: "86462382117559",
};
const voucher = {
  Resultado: "A",
  PtoVta: 2,
  CbteTipo: 3,
  CbteDesde: 4,
  CodAutorizacion: note.arcaCae,
  ImpNeto: 547_433.24,
  ImpOpEx: 0,
  ImpTotConc: 0,
  ImpIVA: 114_960.98,
  ImpTrib: 0,
  ImpTotal: note.amount,
  Iva: { AlicIva: [{ Id: 5, BaseImp: 547_433.24, Importe: 114_960.98 }] },
};

describe("authorized credit note fiscal breakdown", () => {
  it("recovers the actual NC-00004 amounts without using the current sale", () => {
    expect(
      resolveCreditNoteFiscalBreakdown({ voucherInfo: voucher }, note)
    ).toMatchObject({
      netAmount: 547_433.24,
      totalAmount: 662_394.22,
      taxes: [{ name: "IVA", rate: 21, taxAmount: 114_960.98 }],
    });
  });
  it("rejects missing, inconsistent and foreign authorizations instead of inventing zero VAT", () => {
    for (const response of [
      null,
      {},
      { voucherInfo: { ...voucher, ImpIVA: 0 } },
      { voucherInfo: { ...voucher, PtoVta: 3 } },
      { voucherInfo: { ...voucher, CodAutorizacion: "other" } },
    ]) {
      expect(resolveCreditNoteFiscalBreakdown(response, note)).toBeNull();
    }
    expect(
      resolveCreditNoteFiscalBreakdown(
        { voucherInfo: voucher },
        { ...note, salesOrderId: null }
      )
    ).toBeNull();
  });
  it("handles several VAT rates, tributes and exempt/non-taxed amounts", () => {
    const response = {
      voucherInfo: {
        ...voucher,
        ImpNeto: 200,
        ImpOpEx: 10,
        ImpTotConc: 5,
        ImpIVA: 31.5,
        ImpTrib: 2,
        ImpTotal: 248.5,
        Iva: {
          AlicIva: [
            { Id: 5, BaseImp: 100, Importe: 21 },
            { Id: 4, BaseImp: 100, Importe: 10.5 },
          ],
        },
        Tributos: {
          Tributo: { Desc: "Percepción", Alic: 1, BaseImp: 200, Importe: 2 },
        },
      },
    };
    expect(
      resolveCreditNoteFiscalBreakdown(response, {
        ...note,
        amount: 248.5,
      })?.taxes.map((tax) => tax.taxAmount)
    ).toEqual([21, 10.5, 2]);
  });
});
