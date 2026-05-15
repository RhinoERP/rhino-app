"use client";

import { PrinterIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { usePrintTicket } from "@/modules/sales/hooks/use-print-ticket";
import type {
  DirectSaleDetail,
  TicketCompanyData,
  TicketSaleData,
  TicketSaleItem,
} from "@/modules/sales/types";

type DirectSaleReprintButtonProps = {
  sale: DirectSaleDetail;
  company: TicketCompanyData;
};

function resolveTicketQuantityKind(
  unitOfMeasure?: string | null
): TicketSaleItem["quantityKind"] {
  if (
    unitOfMeasure === "KG" ||
    unitOfMeasure === "LT" ||
    unitOfMeasure === "MT"
  ) {
    return "weight";
  }

  return "units";
}

function resolvePaymentMethod(sale: DirectSaleDetail): string | null {
  const paymentMethods = sale.payments
    .map((payment) => String(payment.payment_method ?? "").trim())
    .filter(Boolean);

  return paymentMethods.length > 0 ? paymentMethods.join(", ") : null;
}

function mapSaleToTicketData(sale: DirectSaleDetail): TicketSaleData {
  const items = sale.items.map((item) => ({
    quantity: Number(item.quantity ?? 0),
    product: item.product?.name ?? item.product?.sku ?? "Producto",
    unitPrice: Number(item.unit_price ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    quantityKind: resolveTicketQuantityKind(item.product?.unitOfMeasure),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Number(sale.total_amount ?? subtotal);

  return {
    saleNumber: sale.receipt_number ?? sale.id,
    saleDate: sale.sale_date,
    invoiceType: sale.invoice_type,
    invoiceNumber: sale.invoice_number,
    cae: sale.cae,
    caeExpirationDate: sale.cae_expiration_date,
    paymentMethod: resolvePaymentMethod(sale),
    items,
    subtotal,
    taxAmount: Number(sale.tax_amount ?? 0),
    total,
  };
}

export function DirectSaleReprintButton({
  sale,
  company,
}: DirectSaleReprintButtonProps) {
  const { isPrinting, printTicket } = usePrintTicket({
    transport: "web-usb",
  });

  const ticketSale = useMemo(() => mapSaleToTicketData(sale), [sale]);

  return (
    <Button
      className="w-full justify-between"
      disabled={isPrinting}
      onClick={() => {
        printTicket({
          sale: ticketSale,
          company,
        });
      }}
      type="button"
      variant="outline"
    >
      <div className="flex items-center">
        <PrinterIcon className="mr-2 h-4 w-4" />
        {isPrinting ? "Imprimiendo..." : "Reimprimir ticket"}
      </div>
    </Button>
  );
}
