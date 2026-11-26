import type { CuentaItem } from "@/lib/accounting-client";
import {
  MELI_ACCOUNTING_COMPONENT_ACCOUNTS,
  MELI_ACCOUNTING_COUNTERPART_ACCOUNT,
} from "./accounting-breakdown";
import { buildMeliAccountingComponents } from "./accounting-components";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import { buildMeliPaymentAccountingLines } from "./accounting-payment-lines";

type Snapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;

export function buildMeliPaymentPreview(
  payment: { grossAmount: string; currency: "ARS" | "USD" },
  breakdown: unknown,
  snapshot: Snapshot,
  accounts: CuentaItem[]
) {
  const available = accounts.filter(
    (account) =>
      account.activa &&
      account.permite_movimientos &&
      (account.moneda === payment.currency || account.moneda === "AMBAS")
  );
  const components = buildMeliAccountingComponents(
    payment.grossAmount,
    breakdown
  );

  function resolve(code: string): string {
    const matches = available.filter(
      (account) => account.account_code === code
    );
    if (matches.length !== 1) {
      throw new Error(
        `La cuenta ${code} falta, está inactiva o no es única para esta moneda.`
      );
    }
    return matches[0].id;
  }

  for (const component of components) {
    for (const account of [component.debit, component.credit]) {
      if (
        account.kind === "manual" &&
        !available.some(
          (candidate) => candidate.id.toLowerCase() === account.id.toLowerCase()
        )
      ) {
        throw new Error(
          `La cuenta manual del concepto ${component.key} no está disponible para esta moneda.`
        );
      }
    }
  }
  const fixed = new Set(components.map((component) => component.key));
  const resolved = {
    receivable: resolve(MELI_ACCOUNTING_COUNTERPART_ACCOUNT),
    net: fixed.has("net")
      ? resolve(MELI_ACCOUNTING_COMPONENT_ACCOUNTS.net)
      : undefined,
    discount: fixed.has("discount")
      ? resolve(MELI_ACCOUNTING_COMPONENT_ACCOUNTS.discount)
      : undefined,
    commission: fixed.has("commission")
      ? resolve(MELI_ACCOUNTING_COMPONENT_ACCOUNTS.commission)
      : undefined,
    shipping: fixed.has("shipping")
      ? resolve(MELI_ACCOUNTING_COMPONENT_ACCOUNTS.shipping)
      : undefined,
  };
  return buildMeliPaymentAccountingLines(
    payment,
    breakdown,
    snapshot,
    resolved
  );
}
