import { z } from "zod";
import type { CreditNote } from "../types";

const money = z.number().finite().nonnegative();
const vat = z.object({ Id: z.number().int(), BaseImp: money, Importe: money });
const tribute = z.object({
  Desc: z.string(),
  Alic: money,
  BaseImp: money,
  Importe: money,
});
const voucherSchema = z.object({
  Resultado: z.literal("A"),
  PtoVta: z.number().int(),
  CbteTipo: z.number().int(),
  CbteDesde: z.number().int(),
  CodAutorizacion: z.union([z.string(), z.number()]),
  ImpNeto: money,
  ImpOpEx: money,
  ImpTotConc: money,
  ImpIVA: money,
  ImpTrib: money,
  ImpTotal: money,
  Iva: z.object({ AlicIva: z.union([vat, z.array(vat)]) }).optional(),
  Tributos: z
    .object({ Tributo: z.union([tribute, z.array(tribute)]) })
    .optional(),
});
const rates: Record<number, number> = {
  3: 0,
  4: 10.5,
  5: 21,
  6: 27,
  8: 5,
  9: 2.5,
};
const close = (a: number, b: number) => Math.abs(a - b) < 0.011;

/** Presentation only: never derive an authorized document from the current sale. */
export function resolveCreditNoteFiscalBreakdown(
  response: unknown,
  note: {
    salesOrderId: string | null;
    arcaStatus: string;
    amount: number;
    arcaPointOfSale: number | null;
    arcaVoucherTypeCode: number | null;
    arcaVoucherNumber: number | null;
    arcaCae: string | null;
  }
): CreditNote["fiscalBreakdown"] {
  if (!note.salesOrderId || note.arcaStatus !== "authorized") {
    return null;
  }
  const parsed = z.object({ voucherInfo: voucherSchema }).safeParse(response);
  if (!parsed.success) {
    return null;
  }
  const v = parsed.data.voucherInfo;
  if (
    v.PtoVta !== note.arcaPointOfSale ||
    v.CbteTipo !== note.arcaVoucherTypeCode ||
    v.CbteDesde !== note.arcaVoucherNumber ||
    String(v.CodAutorizacion) !== note.arcaCae ||
    !close(v.ImpTotal, note.amount)
  ) {
    return null;
  }
  const iva = v.Iva ? [v.Iva.AlicIva].flat() : [];
  const tributes = v.Tributos ? [v.Tributos.Tributo].flat() : [];
  if (
    !(
      close(
        iva.reduce((sum, tax) => sum + tax.Importe, 0),
        v.ImpIVA
      ) &&
      close(
        tributes.reduce((sum, tax) => sum + tax.Importe, 0),
        v.ImpTrib
      ) &&
      close(
        v.ImpNeto + v.ImpOpEx + v.ImpTotConc + v.ImpIVA + v.ImpTrib,
        v.ImpTotal
      )
    )
  ) {
    return null;
  }
  return {
    netAmount: v.ImpNeto,
    exemptAmount: v.ImpOpEx,
    untaxedAmount: v.ImpTotConc,
    totalAmount: v.ImpTotal,
    taxes: [
      ...iva.map((tax) => ({
        name: rates[tax.Id] === undefined ? `IVA (código ${tax.Id})` : "IVA",
        rate: rates[tax.Id] ?? 0,
        baseAmount: tax.BaseImp,
        taxAmount: tax.Importe,
      })),
      ...tributes.map((tax) => ({
        name: tax.Desc,
        rate: tax.Alic,
        baseAmount: tax.BaseImp,
        taxAmount: tax.Importe,
      })),
    ],
  };
}
