import { z } from "zod";

const MONEY_PATTERN = /^(0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
const MAX_CENTS = BigInt("9007199254740991");
const CENTS_PER_UNIT = BigInt(100);

export const MELI_ACCOUNTING_COMPONENT_ACCOUNTS = {
  net: "MERCADO_PAGO",
  discount: "DESCUENTOS_OTORGADOS",
  commission: "COMISIONES_POR_VENTAS",
  shipping: "VIATICOS",
} as const;
export const MELI_ACCOUNTING_COUNTERPART_ACCOUNT = "AR_DEUDORES_VENTAS";

function toCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * CENTS_PER_UNIT + BigInt(fraction.padEnd(2, "0"));
}

const money = z
  .string()
  .regex(MONEY_PATTERN, "Ingresá un importe con hasta dos decimales.")
  .refine(
    (value) => !MONEY_PATTERN.test(value) || toCents(value) <= MAX_CENTS,
    "El importe supera la precisión monetaria admitida."
  );

const manualConcept = z
  .object({
    description: z.string().trim().min(1).max(200),
    accountId: z.uuid(),
    amount: money.refine(
      (value) => !MONEY_PATTERN.test(value) || toCents(value) > BigInt(0),
      "El concepto manual debe tener un importe mayor a cero."
    ),
    direction: z.enum(["ADD", "SUBTRACT"]),
  })
  .strict();

export const meliAccountingBreakdownSchema = z
  .object({
    net: money,
    discount: money,
    commission: money,
    shipping: money,
    manualConcepts: z.array(manualConcept).max(100).optional(),
  })
  .strict();

export type MeliAccountingBreakdown = z.output<
  typeof meliAccountingBreakdownSchema
>;

export function validateMeliAccountingBreakdown(
  grossAmount: string,
  breakdown: unknown
): MeliAccountingBreakdown {
  const gross = money.parse(grossAmount);
  const parsed = meliAccountingBreakdownSchema.parse(breakdown);
  if (toCents(gross) === BigInt(0)) {
    throw new Error("El importe bruto debe ser mayor a cero.");
  }
  let total =
    toCents(parsed.net) +
    toCents(parsed.discount) +
    toCents(parsed.commission) +
    toCents(parsed.shipping);
  for (const concept of parsed.manualConcepts ?? []) {
    const amount = toCents(concept.amount);
    total += concept.direction === "ADD" ? amount : -amount;
  }
  if (total !== toCents(gross)) {
    throw new Error("El desglose contable no coincide con el cobro bruto.");
  }
  return parsed;
}
