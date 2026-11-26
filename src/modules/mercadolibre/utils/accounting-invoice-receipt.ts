import { z } from "zod";
import { MELI_ACCOUNTING_COUNTERPART_ACCOUNT } from "./accounting-breakdown";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import {
  convertAccountingToPesos,
  parseAccountingCents,
  parseAccountingRate,
} from "./accounting-money";

const lineSchema = z
  .object({
    accountId: z.uuid(),
    side: z.enum(["DEBE", "HABER"]),
    originalAmount: z.string(),
    pesosAmount: z.string(),
  })
  .strict();
export const fiscalJournalPayloadSchema = z
  .object({
    orgId: z.uuid(),
    originType: z.enum(["invoice", "creditNote"]),
    originId: z.uuid(),
    componentKey: z.literal("fiscal"),
    requestKey: z.uuid(),
    date: z.iso.date(),
    description: z.string().min(1).max(2000),
    actorId: z.uuid(),
    currency: z.enum(["ARS", "USD"]),
    exchangeRate: z.string(),
    lines: z.array(lineSchema).min(2).max(200),
  })
  .strict();
export const invoiceReceiptSchema = z
  .object({
    journalEntryId: z.uuid(),
    payload: fiscalJournalPayloadSchema.extend({
      originType: z.literal("invoice"),
    }),
  })
  .strict();

export function assertMeliFiscalPayloadMatchesSource(
  payload: z.output<typeof fiscalJournalPayloadSchema>,
  source: {
    orgId: string;
    originId: string;
    originType: "invoice" | "creditNote";
  },
  snapshot: ReturnType<typeof readMeliAccountingFiscalSnapshot>,
  accounts: { id: string; account_code: string | null }[]
) {
  if (
    payload.orgId.toLowerCase() !== source.orgId.toLowerCase() ||
    payload.originId.toLowerCase() !== source.originId.toLowerCase() ||
    payload.originType !== source.originType ||
    payload.date !== snapshot.date ||
    payload.currency !== snapshot.currency
  ) {
    throw new Error(
      "El asiento no coincide con el comprobante fiscal autorizado."
    );
  }
  const rate = parseAccountingRate(snapshot.exchangeRate, snapshot.currency);
  if (
    parseAccountingRate(Number(payload.exchangeRate), payload.currency) !== rate
  ) {
    throw new Error("La cotización del asiento no coincide con la factura.");
  }
  const receivableSide = source.originType === "invoice" ? "DEBE" : "HABER";
  const receivableLines = payload.lines.filter(
    (line) => line.side === receivableSide
  );
  const fiscalLines = payload.lines.filter(
    (line) => line.side !== receivableSide
  );
  const total = parseAccountingCents(snapshot.total);
  if (
    receivableLines.length !== 1 ||
    parseAccountingCents(receivableLines[0].originalAmount) !== total ||
    parseAccountingCents(receivableLines[0].pesosAmount) !==
      convertAccountingToPesos(total, rate)
  ) {
    throw new Error("La contrapartida no coincide con el total fiscal.");
  }
  const receivable = accounts.filter(
    (account) =>
      account.id.toLowerCase() === receivableLines[0].accountId.toLowerCase()
  );
  if (
    receivable.length !== 1 ||
    receivable[0].account_code !== MELI_ACCOUNTING_COUNTERPART_ACCOUNT
  ) {
    throw new Error("La cuenta de deudores del asiento requiere revisión.");
  }
  const expected = [
    snapshot.net,
    snapshot.exempt,
    snapshot.nonTaxable,
    ...snapshot.vatItems.map((item) => item.amount),
    ...snapshot.tributeItems.map((item) => item.amount),
  ]
    .map(parseAccountingCents)
    .filter((amount) => amount > BigInt(0));
  if (fiscalLines.length !== expected.length) {
    throw new Error("Las líneas fiscales del asiento requieren revisión.");
  }
  let creditPesos = BigInt(0);
  for (const line of fiscalLines) {
    const amount = parseAccountingCents(line.originalAmount);
    const index = expected.indexOf(amount);
    const account = accounts.filter(
      (item) => item.id.toLowerCase() === line.accountId.toLowerCase()
    );
    if (
      index < 0 ||
      parseAccountingCents(line.pesosAmount) !==
        convertAccountingToPesos(amount, rate) ||
      account.length !== 1 ||
      line.accountId.toLowerCase() ===
        receivableLines[0].accountId.toLowerCase()
    ) {
      throw new Error("Las líneas fiscales del asiento requieren revisión.");
    }

    creditPesos += parseAccountingCents(line.pesosAmount);
    expected.splice(index, 1);
  }

  if (creditPesos !== convertAccountingToPesos(total, rate)) {
    throw new Error("El asiento fiscal no cuadra en pesos.");
  }
}

export function assertMeliInvoiceReceiptMatchesFiscal(
  receipt: z.output<typeof invoiceReceiptSchema>,
  source: { orgId: string; saleId: string },
  snapshot: ReturnType<typeof readMeliAccountingFiscalSnapshot>,
  accounts: { id: string; account_code: string | null }[]
) {
  assertMeliFiscalPayloadMatchesSource(
    receipt.payload,
    { orgId: source.orgId, originId: source.saleId, originType: "invoice" },
    snapshot,
    accounts
  );
}
