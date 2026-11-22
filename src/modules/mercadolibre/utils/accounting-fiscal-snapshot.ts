import { z } from "zod";
import { getMeliAccountingFiscalCurrency } from "./accounting-fiscal-currency";

const MONEY_PATTERN = /^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/;
const FISCAL_DATE_PATTERN = /^\d{8}$/;
const MAX_CENTS = BigInt("9007199254740991");
const CENTS_PER_UNIT = BigInt(100);

function cents(value: number | string, label: string): bigint {
  const text = String(value);
  const match = MONEY_PATTERN.exec(text);
  if (!match) {
    throw new Error(`El importe fiscal ${label} es inválido.`);
  }
  const result =
    BigInt(match[1]) * CENTS_PER_UNIT + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (result > MAX_CENTS) {
    throw new Error(`El importe fiscal ${label} supera la precisión admitida.`);
  }
  return result;
}

function displayAmount(value: bigint): string {
  return `${value / CENTS_PER_UNIT}.${(value % CENTS_PER_UNIT).toString().padStart(2, "0")}`;
}

const monetaryValue = z.union([z.number().finite(), z.string()]);
const item = z.object({
  Id: z.number().int().positive(),
  Importe: monetaryValue,
});
const requestSchema = z.object({
  wsfeRequest: z.object({
    CbteFch: z.number().int(),
    PtoVta: z.number().int().positive(),
    CbteTipo: z.number().int().positive(),
    CbteDesde: z.number().int().positive(),
    CbteHasta: z.number().int().positive(),
    ImpTotal: monetaryValue,
    ImpTotConc: monetaryValue,
    ImpNeto: monetaryValue,
    ImpOpEx: monetaryValue,
    ImpIVA: monetaryValue,
    ImpTrib: monetaryValue,
    Iva: z.array(item).optional(),
    Tributos: z
      .array(item.extend({ Desc: z.string().trim().min(1) }))
      .optional(),
  }),
});

function fiscalDate(value: number): string {
  const text = String(value);
  if (!FISCAL_DATE_PATTERN.test(text)) {
    throw new Error("La fecha fiscal del comprobante es inválida.");
  }
  const date = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (!z.iso.date().safeParse(date).success) {
    throw new Error("La fecha fiscal del comprobante es inválida.");
  }
  return date;
}

type FiscalSource = {
  status: string;
  cae: string | null;
  currency: "ARS" | "USD";
  amount: number | string;
  pointOfSale: number | null;
  voucherType: number | null;
  voucherNumber: number | null;
  request: unknown;
};

export function readMeliAccountingFiscalSnapshot(source: FiscalSource) {
  if (source.status !== "authorized" || !source.cae?.trim()) {
    throw new Error("El comprobante no tiene una autorización fiscal válida.");
  }
  const parsed = requestSchema.safeParse(source.request);
  if (!parsed.success) {
    throw new Error(
      "El snapshot fiscal autorizado está incompleto o es inválido."
    );
  }
  const request = parsed.data.wsfeRequest;
  if (
    request.PtoVta !== source.pointOfSale ||
    request.CbteTipo !== source.voucherType ||
    request.CbteDesde !== source.voucherNumber ||
    request.CbteHasta !== source.voucherNumber
  ) {
    throw new Error("El comprobante no coincide con su snapshot fiscal.");
  }
  const fiscalCurrency = getMeliAccountingFiscalCurrency(
    source.currency,
    source.request
  );
  const total = cents(request.ImpTotal, "total");
  const net = cents(request.ImpNeto, "neto");
  const exempt = cents(request.ImpOpEx, "exento");
  const nonTaxable = cents(request.ImpTotConc, "no gravado");
  const vat = cents(request.ImpIVA, "IVA");
  const otherTaxes = cents(request.ImpTrib, "tributos");
  if (
    total === BigInt(0) ||
    total !== cents(source.amount, "del comprobante") ||
    total !== net + exempt + nonTaxable + vat + otherTaxes
  ) {
    throw new Error("Los importes del comprobante fiscal no cuadran.");
  }

  const vatItems = (request.Iva ?? []).map((tax) => ({
    id: tax.Id,
    amount: cents(tax.Importe, "IVA"),
  }));
  const tributeItems = (request.Tributos ?? []).map((tax) => ({
    id: tax.Id,
    description: tax.Desc,
    amount: cents(tax.Importe, "tributo"),
  }));
  if (
    vatItems.reduce((sum, tax) => sum + tax.amount, BigInt(0)) !== vat ||
    tributeItems.reduce((sum, tax) => sum + tax.amount, BigInt(0)) !==
      otherTaxes
  ) {
    throw new Error(
      "El detalle de impuestos fiscales no coincide con el total."
    );
  }
  return {
    date: fiscalDate(request.CbteFch),
    ...fiscalCurrency,
    total: displayAmount(total),
    net: displayAmount(net),
    exempt: displayAmount(exempt),
    nonTaxable: displayAmount(nonTaxable),
    vat: displayAmount(vat),
    otherTaxes: displayAmount(otherTaxes),
    vatItems: vatItems.map((tax) => ({
      ...tax,
      amount: displayAmount(tax.amount),
    })),
    tributeItems: tributeItems.map((tax) => ({
      ...tax,
      amount: displayAmount(tax.amount),
    })),
  };
}
