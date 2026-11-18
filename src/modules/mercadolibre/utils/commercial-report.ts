import { z } from "zod";
import { sumMeliMoney } from "./money";

export const meliReportPeriodSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine(
    ({ from, to }) => from <= to,
    "La fecha inicial debe ser anterior a la final."
  );

export type MeliReportRow = {
  currency: string;
  total_amount: number;
  total_tax_amount: number | null;
  arca_status: string;
};

export function summarizeMeliSales(rows: MeliReportRow[]) {
  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  return currencies.map((currency) => {
    const sales = rows.filter((row) => row.currency === currency);
    return {
      currency,
      count: sales.length,
      total: sumMeliMoney(sales.map((sale) => sale.total_amount)),
      taxes: sumMeliMoney(sales.map((sale) => sale.total_tax_amount ?? 0)),
      authorized: sales.filter((sale) => sale.arca_status === "authorized")
        .length,
      pending: sales.filter((sale) => sale.arca_status === "pending").length,
      error: sales.filter((sale) => sale.arca_status === "error").length,
      notRequested: sales.filter((sale) => sale.arca_status === "not_requested")
        .length,
    };
  });
}

export type MeliCreditReportRow = {
  currency: string;
  amount: number;
  arcaStatus: string;
};

export function summarizeMeliCommercialPeriod(
  sales: MeliReportRow[],
  notes: MeliCreditReportRow[]
) {
  const totals = summarizeMeliSales(sales);
  const currencies = [
    ...new Set([
      ...sales.map((sale) => sale.currency),
      ...notes.map((note) => note.currency),
    ]),
  ].sort();
  return currencies.map((currency) => {
    const total = totals.find((row) => row.currency === currency) ?? {
      currency,
      count: 0,
      total: 0,
      taxes: 0,
      authorized: 0,
      pending: 0,
      error: 0,
      notRequested: 0,
    };
    const credits = notes.filter((note) => note.currency === currency);
    const authorizedCredits = sumMeliMoney(
      credits
        .filter((note) => note.arcaStatus === "authorized")
        .map((note) => note.amount)
    );
    return {
      ...total,
      creditNoteCount: credits.length,
      authorizedCredits,
      reservedCredits: sumMeliMoney(credits.map((note) => note.amount)),
      netAfterCredits: sumMeliMoney([total.total, -authorizedCredits]),
    };
  });
}
