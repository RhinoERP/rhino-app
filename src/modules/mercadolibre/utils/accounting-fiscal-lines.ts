import { z } from "zod";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";

type FiscalSnapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;
type FiscalOrigin = "invoice" | "creditNote";

const MONEY = /^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/;
const RATE = /^(0|[1-9]\d{0,5})(?:\.(\d{1,4}))?$/;
const HUNDRED = BigInt(100);
const RATE_SCALE = BigInt(10_000);
const MAX_SOURCE_CENTS = BigInt("9007199254740991");
// accounting.journal_entry_lines uses numeric(15,4).
const MAX_JOURNAL_CENTS = BigInt("9999999999999");

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

function parseCents(value: string): bigint {
  const match = MONEY.exec(value);
  if (!match) {
    throw new Error("Importe fiscal inválido para el asiento Meli.");
  }
  const result =
    BigInt(match[1]) * HUNDRED + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (result > MAX_SOURCE_CENTS) {
    throw new Error("El importe fiscal supera la precisión admitida.");
  }
  return result;
}

function parseRate(rate: number | null, currency: "ARS" | "USD"): bigint {
  const match = RATE.exec(String(rate));
  if (!match) {
    throw new Error(
      "La cotización fiscal no puede representarse con la precisión del diario."
    );
  }
  const value =
    BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? "").padEnd(4, "0"));
  if (value === BigInt(0) || (currency === "ARS" && value !== RATE_SCALE)) {
    throw new Error("La cotización fiscal no es válida para la moneda.");
  }
  return value;
}

function formatCents(amount: bigint): string {
  return `${amount / HUNDRED}.${(amount % HUNDRED).toString().padStart(2, "0")}`;
}

function convertToPesos(amount: bigint, rate: bigint): bigint {
  const converted = (amount * rate + RATE_SCALE / BigInt(2)) / RATE_SCALE;
  if (converted > MAX_JOURNAL_CENTS) {
    throw new Error("El importe en pesos supera la precisión del diario.");
  }
  return converted;
}

function validateFiscalDetails(
  snapshot: FiscalSnapshot,
  accounts: z.output<typeof accountAssignments>
): bigint {
  const total = parseCents(snapshot.total);
  if (total === BigInt(0)) {
    throw new Error("El importe fiscal debe ser mayor a cero.");
  }
  if (total > MAX_JOURNAL_CENTS) {
    throw new Error("El importe de origen supera la precisión del diario.");
  }
  if (
    snapshot.vatItems.reduce(
      (sum, item) => sum + parseCents(item.amount),
      BigInt(0)
    ) !== parseCents(snapshot.vat) ||
    snapshot.tributeItems.reduce(
      (sum, item) => sum + parseCents(item.amount),
      BigInt(0)
    ) !== parseCents(snapshot.otherTaxes) ||
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
  const rate = parseRate(snapshot.exchangeRate, snapshot.currency);
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
    const amount = parseCents(item.amount);
    if (amount === BigInt(0)) {
      continue;
    }
    if (
      !item.account ||
      item.account.toLowerCase() === accounts.receivable.toLowerCase()
    ) {
      throw new Error(`Asigná una cuenta válida al concepto ${item.key}.`);
    }
    const pesos = convertToPesos(amount, rate);
    if (pesos === BigInt(0)) {
      throw new Error(`El concepto ${item.key} se redondea a cero en pesos.`);
    }
    originalSum += amount;
    pesosSum += pesos;
    lines.push({
      key: item.key,
      accountId: item.account,
      side: origin === "invoice" ? "HABER" : "DEBE",
      originalAmount: formatCents(amount),
      pesosAmount: formatCents(pesos),
    });
  }
  const totalPesos = convertToPesos(total, rate);
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
      originalAmount: formatCents(total),
      pesosAmount: formatCents(totalPesos),
    },
    ...lines,
  ];
}
