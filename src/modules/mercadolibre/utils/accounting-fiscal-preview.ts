import type { CuentaItem } from "@/lib/accounting-client";
import { MELI_ACCOUNTING_COUNTERPART_ACCOUNT } from "./accounting-breakdown";
import { buildMeliFiscalAccountingLines } from "./accounting-fiscal-lines";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";

type Snapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;

export function availableMeliFiscalAccounts(
  accounts: CuentaItem[],
  currency: Snapshot["currency"]
) {
  return accounts.filter(
    (account) =>
      account.activa &&
      account.permite_movimientos &&
      (account.moneda === currency || account.moneda === "AMBAS")
  );
}

export function meliFiscalAccountFields(snapshot: Snapshot) {
  return [
    { key: "receivable", label: "Deudores" },
    ...(snapshot.net !== "0.00" ? [{ key: "net", label: "Neto gravado" }] : []),
    ...(snapshot.exempt !== "0.00" ? [{ key: "exempt", label: "Exento" }] : []),
    ...(snapshot.nonTaxable !== "0.00"
      ? [{ key: "nonTaxable", label: "No gravado" }]
      : []),
    ...snapshot.vatItems.map((tax, index) => ({
      key: `vat:${index}`,
      label: `IVA ARCA ${tax.id} (${tax.amount})`,
    })),
    ...snapshot.tributeItems.map((tax, index) => ({
      key: `tribute:${index}`,
      label: `Tributo ARCA ${tax.id} ${tax.description} (${tax.amount})`,
    })),
  ];
}

export function suggestMeliFiscalAccountAssignments(
  snapshot: Snapshot,
  accounts: CuentaItem[]
): Record<string, string> {
  const available = availableMeliFiscalAccounts(accounts, snapshot.currency);
  const assignments: Record<string, string> = {};
  for (const field of meliFiscalAccountFields(snapshot)) {
    let code = "VENTAS_MERCADO_LIBRE";
    if (field.key === "receivable") {
      code = MELI_ACCOUNTING_COUNTERPART_ACCOUNT;
    } else if (field.key.startsWith("vat:")) {
      code = "IVA_DEBITO_FISCAL";
    } else if (field.key.startsWith("tribute:")) {
      code = "TRIBUTOS_A_PAGAR";
    }
    const matches = available.filter(
      (account) => account.account_code === code
    );
    if (matches.length === 1) {
      assignments[field.key] = matches[0].id;
    }
  }
  return assignments;
}

export function buildMeliFiscalPreview(
  origin: "invoice" | "creditNote",
  snapshot: Snapshot,
  accounts: CuentaItem[],
  assignments: Record<string, string>
) {
  const available = availableMeliFiscalAccounts(accounts, snapshot.currency);
  if (
    meliFiscalAccountFields(snapshot).some(
      (field) =>
        !available.some((account) => account.id === assignments[field.key])
    )
  ) {
    throw new Error("Asigná una cuenta disponible a cada concepto.");
  }
  return buildMeliFiscalAccountingLines(origin, snapshot, {
    receivable: assignments.receivable,
    net: assignments.net,
    exempt: assignments.exempt,
    nonTaxable: assignments.nonTaxable,
    vat: snapshot.vatItems.map((_, index) => assignments[`vat:${index}`]),
    tributes: snapshot.tributeItems.map(
      (_, index) => assignments[`tribute:${index}`]
    ),
  });
}
