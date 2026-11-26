import { z } from "zod";
import {
  MELI_ACCOUNTING_COMPONENT_ACCOUNTS,
  MELI_ACCOUNTING_COUNTERPART_ACCOUNT,
} from "./accounting-breakdown";
import {
  buildMeliAccountingComponents,
  type MeliAccountingComponent,
  normalizeMeliAccountingGrossAmount,
} from "./accounting-components";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import {
  assertJournalAmount,
  convertAccountingToPesos,
  formatAccountingCents,
  parseAccountingCents,
  parseAccountingRate,
} from "./accounting-money";

type FiscalSnapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;
const accountsSchema = z
  .object({
    receivable: z.uuid(),
    net: z.uuid().optional(),
    discount: z.uuid().optional(),
    commission: z.uuid().optional(),
    shipping: z.uuid().optional(),
  })
  .strict();

type ProposedComponent = {
  key: string;
  description: string;
  lines: {
    accountId: string;
    side: "DEBE" | "HABER";
    originalAmount: string;
    pesosAmount: string;
  }[];
};

function resolveComponentAccount(
  account: MeliAccountingComponent["debit"],
  accounts: z.output<typeof accountsSchema>
): string | undefined {
  if (account.kind === "manual") {
    return account.id;
  }
  const resolved: Record<string, string | undefined> = {
    [MELI_ACCOUNTING_COUNTERPART_ACCOUNT]: accounts.receivable,
    [MELI_ACCOUNTING_COMPONENT_ACCOUNTS.net]: accounts.net,
    [MELI_ACCOUNTING_COMPONENT_ACCOUNTS.discount]: accounts.discount,
    [MELI_ACCOUNTING_COMPONENT_ACCOUNTS.commission]: accounts.commission,
    [MELI_ACCOUNTING_COMPONENT_ACCOUNTS.shipping]: accounts.shipping,
  };
  return resolved[account.code];
}

function buildComponent(
  component: MeliAccountingComponent,
  accounts: z.output<typeof accountsSchema>,
  rate: bigint
): ProposedComponent {
  const amount = parseAccountingCents(component.amount);
  assertJournalAmount(amount);
  const debit = resolveComponentAccount(component.debit, accounts);
  const credit = resolveComponentAccount(component.credit, accounts);
  if (!(debit && credit) || debit.toLowerCase() === credit.toLowerCase()) {
    throw new Error(`Asigná una cuenta válida al concepto ${component.key}.`);
  }
  const pesos = convertAccountingToPesos(amount, rate);
  if (pesos === BigInt(0)) {
    throw new Error(
      `El concepto ${component.key} se redondea a cero en pesos.`
    );
  }
  return {
    key: component.key,
    description: component.description,
    lines: [
      {
        accountId: debit,
        side: "DEBE",
        originalAmount: formatAccountingCents(amount),
        pesosAmount: formatAccountingCents(pesos),
      },
      {
        accountId: credit,
        side: "HABER",
        originalAmount: formatAccountingCents(amount),
        pesosAmount: formatAccountingCents(pesos),
      },
    ],
  };
}

export function assertMeliPaymentBreakdownPesos(
  payment: { grossAmount: string; currency: "ARS" | "USD" },
  rawBreakdown: unknown,
  fiscalSnapshot: FiscalSnapshot
): MeliAccountingComponent[] {
  const currency = z.enum(["ARS", "USD"]).parse(payment.currency);
  if (fiscalSnapshot.currency !== currency) {
    throw new Error("La moneda del cobro no coincide con la factura fiscal.");
  }
  const components = buildMeliAccountingComponents(
    payment.grossAmount,
    rawBreakdown
  );
  const rate = parseAccountingRate(fiscalSnapshot.exchangeRate, currency);
  const gross = parseAccountingCents(
    normalizeMeliAccountingGrossAmount(payment.grossAmount)
  );
  assertJournalAmount(gross);
  const expectedPesos = convertAccountingToPesos(gross, rate);
  if (expectedPesos === BigInt(0)) {
    throw new Error("El cobro se redondea a cero en pesos; requiere revisión.");
  }
  let totalPesos = BigInt(0);
  for (const component of components) {
    const amount = parseAccountingCents(component.amount);
    assertJournalAmount(amount);
    const pesos = convertAccountingToPesos(amount, rate);
    if (pesos === BigInt(0)) {
      throw new Error(
        `El concepto ${component.key} se redondea a cero en pesos.`
      );
    }
    const isAddition =
      component.credit.kind === "semantic" &&
      component.credit.code === MELI_ACCOUNTING_COUNTERPART_ACCOUNT;
    totalPesos += isAddition ? pesos : -pesos;
  }
  if (totalPesos !== expectedPesos) {
    throw new Error(
      "El desglose no cuadra en pesos; requiere revisión de redondeo."
    );
  }
  return components;
}

/**
 * Produces a proposal, not an authorization to publish. The caller must validate
 * the fiscal source, payment, accounts, period, permissions and idempotency.
 */
export function buildMeliPaymentAccountingLines(
  payment: { grossAmount: string; currency: "ARS" | "USD" },
  rawBreakdown: unknown,
  fiscalSnapshot: FiscalSnapshot,
  rawAccounts: unknown
) {
  const components = assertMeliPaymentBreakdownPesos(
    payment,
    rawBreakdown,
    fiscalSnapshot
  );
  const accounts = accountsSchema.parse(rawAccounts);
  const rate = parseAccountingRate(
    fiscalSnapshot.exchangeRate,
    payment.currency
  );

  const result: ProposedComponent[] = [];
  for (const component of components) {
    result.push(buildComponent(component, accounts, rate));
  }
  return result;
}
