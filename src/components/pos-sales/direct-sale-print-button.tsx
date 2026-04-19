"use client";

import { PrinterIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { usePrintTicket } from "@/modules/sales/hooks/use-print-ticket";
import type {
  DirectSaleDetail,
  TicketCompanyData,
  TicketSaleData,
} from "@/modules/sales/types";

type DirectSalePrintButtonProps = {
  sale: DirectSaleDetail;
  company: TicketCompanyData;
};

function mapSaleToTicketData(sale: DirectSaleDetail): TicketSaleData {
  const items = sale.items.map((item) => ({
    quantity: Number(item.quantity ?? 0),
    product: item.product?.name ?? item.product?.sku ?? "Producto",
    subtotal: Number(item.subtotal ?? 0),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Number(sale.total_amount ?? subtotal);

  return {
    saleNumber: sale.receipt_number ?? sale.id,
    saleDate: sale.sale_date,
    items,
    subtotal,
    total,
  };
}

export function DirectSalePrintButton({
  sale,
  company,
}: DirectSalePrintButtonProps) {
  const { isPrinting, printTicket } = usePrintTicket();

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
      variant="secondary"
    >
      <div className="flex items-center">
        <PrinterIcon className="mr-2 h-4 w-4" />
        {isPrinting ? "Imprimiendo..." : "Imprimir ticket"}
      </div>
    </Button>
  );
}
