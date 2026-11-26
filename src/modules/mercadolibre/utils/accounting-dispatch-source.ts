import { z } from "zod";
import { normalizeMeliAccountingGrossAmount } from "./accounting-components";
import {
  convertAccountingToPesos,
  parseAccountingCents,
  parseAccountingRate,
} from "./accounting-money";
import type { MeliPaymentRecoveryPayload } from "./accounting-payment-recovery";

const account = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual"), id: z.uuid() }).strict(),
  z.object({ kind: z.literal("semantic"), code: z.string().min(1) }).strict(),
]);
export const meliDispatchSourceSchema = z.object({
  sale_id: z.uuid(),
  payment_date: z.iso.date(),
  currency: z.enum(["ARS", "USD"]),
  payment_status: z.enum(["RECORDED", "VOIDED"]),
  preparation_status: z.enum(["PREPARED", "CANCELLED"]),
  component_amount: z.string(),
  debit_account: account,
  credit_account: account,
});
export type MeliDispatchSource = z.output<typeof meliDispatchSourceSchema>;
export type MeliAccountReference = {
  id: string;
  account_code: string | null;
};

function assertAccountMatches(
  accountId: string,
  expected: z.output<typeof account>,
  accounts: MeliAccountReference[],
  side: "DEBE" | "HABER"
) {
  const matches = accounts.filter(
    (candidate) => candidate.id.toLowerCase() === accountId.toLowerCase()
  );
  if (
    matches.length !== 1 ||
    (expected.kind === "manual"
      ? matches[0].id.toLowerCase() !== expected.id.toLowerCase()
      : matches[0].account_code !== expected.code)
  ) {
    throw new Error(
      `La cuenta ${side} del envío no coincide con el componente.`
    );
  }
}

export function assertMeliDispatchMatchesSource(
  payload: MeliPaymentRecoveryPayload,
  source: MeliDispatchSource,
  accounts: MeliAccountReference[],
  fiscal: {
    currency: "ARS" | "USD";
    exchangeRate: number | null;
    expectedPaymentStatus?: "RECORDED" | "VOIDED";
  }
) {
  if (
    source.payment_status !== (fiscal.expectedPaymentStatus ?? "RECORDED") ||
    source.preparation_status !== "PREPARED" ||
    payload.date !== source.payment_date ||
    payload.currency !== source.currency ||
    payload.lines.length !== 2
  ) {
    throw new Error(
      "El envío no coincide con la vigencia, fecha o moneda del cobro."
    );
  }
  const amount = parseAccountingCents(
    normalizeMeliAccountingGrossAmount(source.component_amount)
  );
  const rate = parseAccountingRate(
    Number(payload.exchangeRate),
    payload.currency
  );
  if (
    fiscal.currency !== payload.currency ||
    parseAccountingRate(fiscal.exchangeRate, fiscal.currency) !== rate
  ) {
    throw new Error(
      "La moneda o cotización del envío no coincide con la factura fiscal autorizada."
    );
  }
  const pesos = convertAccountingToPesos(amount, rate);
  if (amount <= BigInt(0) || pesos <= BigInt(0)) {
    throw new Error("El importe del componente no es válido.");
  }
  for (const [side, expected] of [
    ["DEBE", source.debit_account],
    ["HABER", source.credit_account],
  ] as const) {
    const line = payload.lines.find((item) => item.side === side);
    if (
      !line ||
      parseAccountingCents(line.originalAmount) !== amount ||
      parseAccountingCents(line.pesosAmount) !== pesos
    ) {
      throw new Error(
        `El importe ${side} del envío no coincide con el componente.`
      );
    }
    assertAccountMatches(line.accountId, expected, accounts, side);
  }
  if (
    payload.lines[0].accountId.toLowerCase() ===
    payload.lines[1].accountId.toLowerCase()
  ) {
    throw new Error("El envío usa la misma cuenta en ambos lados.");
  }
}
