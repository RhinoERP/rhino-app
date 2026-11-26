import { z } from "zod";
import { meliFiscalAccountFields } from "./accounting-fiscal-preview";
import type { readMeliAccountingFiscalSnapshot } from "./accounting-fiscal-snapshot";
import type { invoiceReceiptSchema } from "./accounting-invoice-receipt";
import { parseAccountingCents } from "./accounting-money";

type Snapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;
const mappingSchema = z.record(z.string().min(1), z.uuid());

function mappingKey(snapshot: Snapshot, field: string): string {
  if (field.startsWith("vat:")) {
    const item = snapshot.vatItems[Number(field.slice(4))];
    if (!item) {
      throw new Error("El concepto de IVA no existe en el comprobante.");
    }
    return `vat:${item.id}`;
  }
  if (field.startsWith("tribute:")) {
    const item = snapshot.tributeItems[Number(field.slice(8))];
    if (!item) {
      throw new Error("El tributo no existe en el comprobante.");
    }
    return `tribute:${item.id}:${item.description}`;
  }
  return field;
}

export function fiscalAutomaticMapping(
  snapshot: Snapshot,
  rawAssignments: unknown
): Record<string, string> {
  const assignments = mappingSchema.parse(rawAssignments);
  const mapping: Record<string, string> = {};
  for (const field of meliFiscalAccountFields(snapshot)) {
    const account = assignments[field.key];
    if (!account) {
      throw new Error(`Falta configurar la cuenta ${field.label}.`);
    }
    const key = mappingKey(snapshot, field.key);
    if (mapping[key] && mapping[key].toLowerCase() !== account.toLowerCase()) {
      throw new Error(
        `El concepto ${key} tiene distintas cuentas; requiere configuración manual.`
      );
    }
    mapping[key] = account;
  }
  return mapping;
}

export function fiscalAutomaticAssignments(
  snapshot: Snapshot,
  rawMapping: unknown
): Record<string, string> {
  const mapping = mappingSchema.parse(rawMapping);
  const assignments: Record<string, string> = {};
  for (const field of meliFiscalAccountFields(snapshot)) {
    const account = mapping[mappingKey(snapshot, field.key)];
    if (!account) {
      throw new Error(
        `No hay cuenta automática configurada para ${field.label}.`
      );
    }
    assignments[field.key] = account;
  }
  return assignments;
}

type FiscalLine = {
  accountId: string;
  side: "DEBE" | "HABER";
  originalAmount: string;
  pesosAmount: string;
};

function lineIdentity(line: FiscalLine): string {
  return [
    line.accountId.toLowerCase(),
    line.side,
    parseAccountingCents(line.originalAmount).toString(),
    parseAccountingCents(line.pesosAmount).toString(),
  ].join(":");
}

function fiscalAmounts(snapshot: Snapshot): Map<string, bigint> {
  const amounts = new Map<string, bigint>();
  const add = (key: string, value: string) => {
    amounts.set(
      key,
      (amounts.get(key) ?? BigInt(0)) + parseAccountingCents(value)
    );
  };
  add("net", snapshot.net);
  add("exempt", snapshot.exempt);
  add("nonTaxable", snapshot.nonTaxable);
  for (const item of snapshot.vatItems) {
    add(`vat:${item.id}`, item.amount);
  }
  for (const item of snapshot.tributeItems) {
    add(`tribute:${item.id}:${item.description}`, item.amount);
  }
  return amounts;
}

export function assertAutomaticCreditMatchesInvoice(
  note: Snapshot,
  invoice: Snapshot,
  invoiceProposal: FiscalLine[],
  receipt: z.output<typeof invoiceReceiptSchema>
) {
  const expectedLines = invoiceProposal.map(lineIdentity).sort();
  const actualLines = receipt.payload.lines.map(lineIdentity).sort();
  if (JSON.stringify(expectedLines) !== JSON.stringify(actualLines)) {
    throw new Error(
      "Las cuentas automáticas no coinciden con el asiento original de la factura."
    );
  }
  const invoiceAmounts = fiscalAmounts(invoice);
  for (const [key, amount] of fiscalAmounts(note)) {
    if (amount > (invoiceAmounts.get(key) ?? BigInt(0))) {
      throw new Error(
        `El concepto fiscal ${key} no coincide con la factura; requiere revisión.`
      );
    }
  }
}
