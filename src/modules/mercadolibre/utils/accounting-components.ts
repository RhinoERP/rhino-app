import {
  MELI_ACCOUNTING_COMPONENT_ACCOUNTS,
  MELI_ACCOUNTING_COUNTERPART_ACCOUNT,
  validateMeliAccountingBreakdown,
} from "./accounting-breakdown";

type Account =
  | { kind: "semantic"; code: string }
  | { kind: "manual"; id: string };

export type MeliAccountingComponent = {
  key: string;
  description: string;
  amount: string;
  debit: Account;
  credit: Account;
};

const fixedComponents = [
  { key: "net", description: "Neto acreditado" },
  { key: "discount", description: "Descuento" },
  { key: "commission", description: "Comisión" },
  { key: "shipping", description: "Envío" },
] as const;
const EXTRA_ZERO_PRECISION = /(\.\d{2})0+$/;
const ZERO_AMOUNT = /^0(?:\.0{1,2})?$/;

export function buildMeliAccountingComponents(
  grossAmount: string,
  rawBreakdown: unknown
): MeliAccountingComponent[] {
  const breakdown = validateMeliAccountingBreakdown(
    grossAmount.replace(EXTRA_ZERO_PRECISION, "$1"),
    rawBreakdown
  );
  const counterpart: Account = {
    kind: "semantic",
    code: MELI_ACCOUNTING_COUNTERPART_ACCOUNT,
  };
  const components: MeliAccountingComponent[] = [];

  for (const component of fixedComponents) {
    const amount = breakdown[component.key];
    if (ZERO_AMOUNT.test(amount)) {
      continue;
    }
    components.push({
      key: component.key,
      description: component.description,
      amount,
      debit: {
        kind: "semantic",
        code: MELI_ACCOUNTING_COMPONENT_ACCOUNTS[component.key],
      },
      credit: counterpart,
    });
  }

  for (const [index, concept] of (breakdown.manualConcepts ?? []).entries()) {
    const account: Account = { kind: "manual", id: concept.accountId };
    components.push({
      key: `manual:${index + 1}`,
      description: concept.description,
      amount: concept.amount,
      debit: concept.direction === "ADD" ? account : counterpart,
      credit: concept.direction === "ADD" ? counterpart : account,
    });
  }
  return components;
}
