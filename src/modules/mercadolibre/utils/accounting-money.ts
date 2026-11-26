const MONEY = /^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/;
const RATE = /^(0|[1-9]\d{0,5})(?:\.(\d{1,4}))?$/;
const HUNDRED = BigInt(100);
const RATE_SCALE = BigInt(10_000);
const MAX_SOURCE_CENTS = BigInt("9007199254740991");
// accounting.journal_entry_lines uses numeric(15,4).
const MAX_JOURNAL_CENTS = BigInt("9999999999999");

export function parseAccountingCents(value: string): bigint {
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

export function parseAccountingRate(
  rate: number | null,
  currency: "ARS" | "USD"
): bigint {
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

export function assertJournalAmount(amount: bigint): void {
  if (amount > MAX_JOURNAL_CENTS) {
    throw new Error("El importe de origen supera la precisión del diario.");
  }
}

export function formatAccountingCents(amount: bigint): string {
  return `${amount / HUNDRED}.${(amount % HUNDRED).toString().padStart(2, "0")}`;
}

export function convertAccountingToPesos(amount: bigint, rate: bigint): bigint {
  const converted = (amount * rate + RATE_SCALE / BigInt(2)) / RATE_SCALE;
  if (converted > MAX_JOURNAL_CENTS) {
    throw new Error("El importe en pesos supera la precisión del diario.");
  }
  return converted;
}
