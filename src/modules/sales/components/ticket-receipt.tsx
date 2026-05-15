"use client";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
} from "../types";
import { abbreviateTicketProductName } from "../utils/abbreviate-ticket-product-name";
import {
  formatCaeExpirationDate,
  formatTicketPaymentMethod,
} from "../utils/ticket-fiscal";

const PRINT_PRODUCT_NAME_MAX_LENGTH = 18;

type TicketReceiptProps = {
  company: TicketCompanyData;
  sale: TicketSaleData;
  className?: string;
};

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatTicketDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear() % 100).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year}, ${hours}:${minutes} hs.`;
}

type QuantityColumnMode = "units" | "weight" | "mixed";

function isWeightQuantityItem(item: TicketSaleItem): boolean {
  if (item.quantityKind) {
    return item.quantityKind === "weight";
  }

  return !Number.isInteger(item.quantity);
}

function resolveQuantityColumnMode(
  items: TicketSaleItem[]
): QuantityColumnMode {
  let hasUnits = false;
  let hasWeight = false;

  for (const item of items) {
    if (isWeightQuantityItem(item)) {
      hasWeight = true;
    } else {
      hasUnits = true;
    }

    if (hasUnits && hasWeight) {
      return "mixed";
    }
  }

  return hasWeight ? "weight" : "units";
}

function resolveQuantityHeader(): string {
  return "Cantidad/Kg";
}

function formatQuantityCell(
  item: TicketSaleItem,
  mode: QuantityColumnMode
): string {
  const quantity = formatQuantity(item.quantity);

  if (mode !== "mixed") {
    return quantity;
  }

  return `${quantity} ${isWeightQuantityItem(item) ? "kg" : "un"}`;
}

function formatTaxLabel(name: string, rate?: number | null): string {
  const normalizedRate = Number(rate);
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) {
    return name;
  }

  return `${name} (${normalizedRate.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%)`;
}

function TicketTaxLines({
  fallbackTaxAmount,
  taxes,
}: {
  fallbackTaxAmount: number;
  taxes: NonNullable<TicketSaleData["taxes"]>;
}) {
  if (taxes.length > 0) {
    return taxes.map((tax, index) => (
      <div
        className="mt-1 flex items-center justify-between"
        key={`${tax.name}-${index}`}
      >
        <span>{formatTaxLabel(tax.name, tax.rate)}</span>
        <span>{formatCurrency(tax.amount)}</span>
      </div>
    ));
  }

  if (fallbackTaxAmount <= 0) {
    return null;
  }

  return (
    <div className="mt-1 flex items-center justify-between">
      <span>Impuestos</span>
      <span>{formatCurrency(fallbackTaxAmount)}</span>
    </div>
  );
}

function TicketFiscalFooter({
  cae,
  caeExpirationDate,
  paymentMethod,
}: {
  cae: string | null;
  caeExpirationDate: string | null;
  paymentMethod: string | null;
}) {
  if (!(paymentMethod || cae || caeExpirationDate)) {
    return null;
  }

  return (
    <div className="mt-2 border-black border-t border-dashed pt-2 text-[10px]">
      {paymentMethod ? (
        <div className="flex items-start justify-between gap-2">
          <span>Medio de pago</span>
          <span className="text-right">{paymentMethod}</span>
        </div>
      ) : null}
      {cae ? (
        <div className="mt-1 flex items-start justify-between gap-2">
          <span>CAE</span>
          <span className="text-right">{cae}</span>
        </div>
      ) : null}
      {caeExpirationDate ? (
        <div className="mt-1 flex items-start justify-between gap-2">
          <span>Vto. CAE</span>
          <span className="text-right">{caeExpirationDate}</span>
        </div>
      ) : null}
    </div>
  );
}

export function TicketReceipt({
  company,
  sale,
  className,
}: TicketReceiptProps) {
  const formattedDate = formatTicketDate(sale.printedAt ?? sale.saleDate);
  const quantityColumnMode = resolveQuantityColumnMode(sale.items);
  const quantityHeader = resolveQuantityHeader();
  const ticketTaxes = (sale.taxes ?? []).filter(
    (tax) => Number.isFinite(tax.amount) && tax.amount > 0
  );
  const fallbackTaxAmount =
    typeof sale.taxAmount === "number" &&
    Number.isFinite(sale.taxAmount) &&
    sale.taxAmount > 0
      ? sale.taxAmount
      : 0;
  const paymentMethod = formatTicketPaymentMethod(sale.paymentMethod);
  const cae = sale.cae?.trim() || null;
  const caeExpirationDate = formatCaeExpirationDate(sale.caeExpirationDate);

  return (
    <section
      aria-hidden="true"
      className={cn("hidden print:block", className)}
      data-rhino-ticket-receipt="true"
    >
      <div className="mx-auto w-[80mm] max-w-[80mm] bg-white px-[2.5mm] py-[2mm] font-sans text-[11px] text-black tabular-nums leading-tight">
        <header className="border-black border-b border-dashed pb-2 text-center">
          <p className="font-bold uppercase">{company.name}</p>
          <p>CUIT: {company.cuit}</p>
          {sale.saleNumber ? <p>Ticket: {sale.saleNumber}</p> : null}
          {formattedDate ? <p>Fecha: {formattedDate}</p> : null}
          <p className="mt-1 font-semibold">Gracias por su compra</p>
        </header>

        <div className="pt-2">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-black border-b border-dashed">
                <th className="w-[14mm] py-1 text-left font-semibold">
                  {quantityHeader}
                </th>
                <th className="py-1 text-left font-semibold">Producto</th>
                <th className="w-[23mm] py-1 text-right font-semibold">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {sale.items.length > 0 ? (
                sale.items.map((item, index) => (
                  <tr className="align-top" key={`${item.product}-${index}`}>
                    <td className="py-1 pr-1 text-left">
                      {formatQuantityCell(item, quantityColumnMode)}
                    </td>
                    <td className="max-w-0 overflow-hidden whitespace-nowrap py-1 pr-1">
                      {abbreviateTicketProductName(
                        item.product,
                        PRINT_PRODUCT_NAME_MAX_LENGTH
                      )}
                    </td>
                    <td className="py-1 text-right">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-2 text-center" colSpan={3}>
                    Sin items en la venta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-2 border-black border-t border-dashed pt-2">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          <TicketTaxLines
            fallbackTaxAmount={fallbackTaxAmount}
            taxes={ticketTaxes}
          />
          <div className="mt-1 flex items-center justify-between font-bold text-[12px]">
            <span>Total</span>
            <span>{formatCurrency(sale.total)}</span>
          </div>
          <TicketFiscalFooter
            cae={cae}
            caeExpirationDate={caeExpirationDate}
            paymentMethod={paymentMethod}
          />
        </footer>
      </div>
    </section>
  );
}
