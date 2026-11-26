import { z } from "zod";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import {
  assertJournalAmount,
  convertAccountingToPesos,
  formatAccountingCents,
  parseAccountingCents,
  parseAccountingRate,
} from "./accounting-money";

type FiscalSnapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;
type FiscalOrigin = "invoice" | "creditNote";

const accountAssignments = z
  .object({
    receivable: z.uuid(),
    net: z.uuid().optional(),
    exempt: z.uuid().optional(),
    nonTaxable: z.uuid().optional(),
    vat: z.array(z.uuid()),
    tributes: z.array(z.uuid()),
  })
  .strict();

function validateFiscalDetails(
  snapshot: FiscalSnapshot,
  accounts: z.output<typeof accountAssignments>
): bigint {
  const total = parseAccountingCents(snapshot.total);
  if (total === BigInt(0)) {
    throw new Error("El importe fiscal debe ser mayor a cero.");
  }
  assertJournalAmount(total);
  if (
    snapshot.vatItems.reduce(
      (sum, item) => sum + parseAccountingCents(item.amount),
      BigInt(0)
    ) !== parseAccountingCents(snapshot.vat) ||
    snapshot.tributeItems.reduce(
      (sum, item) => sum + parseAccountingCents(item.amount),
      BigInt(0)
    ) !== parseAccountingCents(snapshot.otherTaxes) ||
    accounts.vat.length !== snapshot.vatItems.length ||
    accounts.tributes.length !== snapshot.tributeItems.length
  ) {
    throw new Error("Faltan asignaciones para el comprobante fiscal.");
  }
  return total;
}

/**
 * Builds a proposal only. The publisher must independently validate account
 * ownership, activity, permissions, source identity and idempotency.
 */
export function buildMeliFiscalAccountingLines(
  origin: FiscalOrigin,
  snapshot: FiscalSnapshot,
  rawAccounts: unknown
) {
  z.enum(["invoice", "creditNote"]).parse(origin);
  const accounts = accountAssignments.parse(rawAccounts);
  const rate = parseAccountingRate(snapshot.exchangeRate, snapshot.currency);
  const total = validateFiscalDetails(snapshot, accounts);
  const items = [
    { key: "net", amount: snapshot.net, account: accounts.net },
    { key: "exempt", amount: snapshot.exempt, account: accounts.exempt },
    {
      key: "nonTaxable",
      amount: snapshot.nonTaxable,
      account: accounts.nonTaxable,
    },
    ...snapshot.vatItems.map((item, index) => ({
      key: `vat:${index + 1}`,
      amount: item.amount,
      account: accounts.vat[index],
    })),
    ...snapshot.tributeItems.map((item, index) => ({
      key: `tribute:${index + 1}`,
      amount: item.amount,
      account: accounts.tributes[index],
    })),
  ];
  let originalSum = BigInt(0);
  let pesosSum = BigInt(0);
  const lines: {
    key: string;
    accountId: string;
    side: "DEBE" | "HABER";
    originalAmount: string;
    pesosAmount: string;
  }[] = [];

  for (const item of items) {
    const amount = parseAccountingCents(item.amount);
    if (amount === BigInt(0)) {
      continue;
    }
    if (
      !item.account ||
      item.account.toLowerCase() === accounts.receivable.toLowerCase()
    ) {
      throw new Error(`Asigná una cuenta válida al concepto ${item.key}.`);
    }
    const pesos = convertAccountingToPesos(amount, rate);
    if (pesos === BigInt(0)) {
      throw new Error(`El concepto ${item.key} se redondea a cero en pesos.`);
    }
    originalSum += amount;
    pesosSum += pesos;
    lines.push({
      key: item.key,
      accountId: item.account,
      side: origin === "invoice" ? "HABER" : "DEBE",
      originalAmount: formatAccountingCents(amount),
      pesosAmount: formatAccountingCents(pesos),
    });
  }
  const totalPesos = convertAccountingToPesos(total, rate);
  if (originalSum !== total || pesosSum !== totalPesos) {
    throw new Error(
      "El comprobante no cuadra en moneda de origen o pesos; requiere revisión de redondeo."
    );
  }
  return [
    {
      key: "receivable",
      accountId: accounts.receivable,
      side: origin === "invoice" ? ("DEBE" as const) : ("HABER" as const),
      originalAmount: formatAccountingCents(total),
      pesosAmount: formatAccountingCents(totalPesos),
    },
    ...lines,
  ];
}
