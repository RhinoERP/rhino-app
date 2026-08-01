import { truncateMoney } from "@/lib/decimal";
import { normalizeArcaTaxCode } from "@/modules/arca/tax-codes";
import type { CreateDebitNoteItemInput, DebitNoteTaxInput } from "./types";

export type CalculatedDebitNoteTax = DebitNoteTaxInput & {
  baseAmount: number;
  taxAmount: number;
};

export type CalculatedDebitNoteItem = Omit<
  CreateDebitNoteItemInput,
  "taxes"
> & {
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxes: CalculatedDebitNoteTax[];
};

export type DebitNoteFiscalBreakdown = {
  items: CalculatedDebitNoteItem[];
  taxes: CalculatedDebitNoteTax[];
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
};

function taxKey(tax: DebitNoteTaxInput) {
  return [
    tax.taxId ?? "none",
    tax.name.trim().toLowerCase(),
    tax.rate,
    normalizeArcaTaxCode(tax.taxCodeSnapshot) ?? "",
  ].join(":");
}

export function calculateDebitNoteBreakdown(
  inputItems: CreateDebitNoteItemInput[]
): DebitNoteFiscalBreakdown {
  if (inputItems.length === 0) {
    throw new Error("Agregá al menos un ítem a la Nota de Débito.");
  }

  const items = inputItems.map((input) => {
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    if (
      !(input.description?.trim() && Number.isFinite(quantity)) ||
      quantity <= 0
    ) {
      throw new Error(
        "Cada ítem debe tener descripción y una cantidad mayor a cero."
      );
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("El precio unitario de cada ítem debe ser válido.");
    }
    const netAmount = truncateMoney(quantity * unitPrice);
    const taxes = (input.taxes ?? []).map((tax) => {
      const rate = Number(tax.rate);
      if (!(tax.name?.trim() && Number.isFinite(rate)) || rate < 0) {
        throw new Error("El impuesto seleccionado no es válido.");
      }
      return {
        ...tax,
        name: tax.name.trim(),
        rate,
        taxCodeSnapshot: normalizeArcaTaxCode(tax.taxCodeSnapshot) ?? null,
        baseAmount: netAmount,
        taxAmount: truncateMoney(netAmount * (rate / 100)),
      };
    });
    const taxAmount = truncateMoney(
      taxes.reduce((sum, tax) => sum + tax.taxAmount, 0)
    );
    return {
      ...input,
      description: input.description.trim(),
      quantity,
      unitPrice: truncateMoney(unitPrice),
      netAmount,
      taxAmount,
      totalAmount: truncateMoney(netAmount + taxAmount),
      taxes,
    };
  });

  const aggregate = new Map<string, CalculatedDebitNoteTax>();
  for (const item of items) {
    for (const tax of item.taxes) {
      const key = taxKey(tax);
      const current = aggregate.get(key);
      if (current) {
        current.baseAmount = truncateMoney(current.baseAmount + tax.baseAmount);
        current.taxAmount = truncateMoney(current.taxAmount + tax.taxAmount);
      } else {
        aggregate.set(key, { ...tax });
      }
    }
  }
  const taxes = [...aggregate.values()];
  const netAmount = truncateMoney(
    items.reduce((sum, item) => sum + item.netAmount, 0)
  );
  const taxAmount = truncateMoney(
    taxes.reduce((sum, tax) => sum + tax.taxAmount, 0)
  );
  return {
    items,
    taxes,
    netAmount,
    taxAmount,
    totalAmount: truncateMoney(netAmount + taxAmount),
  };
}
