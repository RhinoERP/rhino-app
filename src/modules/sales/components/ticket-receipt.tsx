"use client";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TicketCompanyData, TicketSaleData } from "../types";

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

  return parsed.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function TicketReceipt({
  company,
  sale,
  className,
}: TicketReceiptProps) {
  const formattedDate = formatTicketDate(sale.saleDate);

  return (
    <section
      aria-hidden="true"
      className={cn("hidden print:block", className)}
      data-rhino-ticket-receipt="true"
    >
      <div className="mx-auto w-[80mm] max-w-[80mm] bg-white px-[2.5mm] py-[2mm] font-mono text-[11px] text-black tabular-nums leading-tight">
        <header className="border-black border-b border-dashed pb-2 text-center">
          <p className="font-bold uppercase">{company.name}</p>
          <p>CUIT: {company.cuit}</p>
          <p>{company.address}</p>
          {sale.saleNumber ? <p>Ticket: {sale.saleNumber}</p> : null}
          {formattedDate ? <p>Fecha: {formattedDate}</p> : null}
        </header>

        <div className="pt-2">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-black border-b border-dashed">
                <th className="w-[12mm] py-1 text-left font-semibold">Cant.</th>
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
                      {formatQuantity(item.quantity)}
                    </td>
                    <td className="py-1 pr-1">{item.product}</td>
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
          <div className="mt-1 flex items-center justify-between font-bold text-[12px]">
            <span>Total</span>
            <span>{formatCurrency(sale.total)}</span>
          </div>
          <p className="mt-3 text-center font-semibold">
            Gracias por su compra
          </p>
        </footer>
      </div>
    </section>
  );
}
