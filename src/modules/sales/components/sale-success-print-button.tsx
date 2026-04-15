"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreateDirectSaleActionResult } from "../actions/create-direct-sale.action";
import { useDirectSaleMutation } from "../hooks/use-direct-sale-mutation";
import { usePrintTicket } from "../hooks/use-print-ticket";
import type {
  CreateDirectSaleInput,
  TicketCompanyData,
  TicketSaleData,
} from "../types";
import { TicketReceipt } from "./ticket-receipt";

type SaleSuccessPrintButtonProps = {
  orgSlug: string;
  payload: Omit<CreateDirectSaleInput, "orgSlug">;
  company: TicketCompanyData;
  sale: TicketSaleData;
  className?: string;
  onSaleCreated?: (
    result: CreateDirectSaleActionResult
  ) => Promise<void> | void;
};

/**
 * Ejemplo de integración: registra la venta, invalida queries vía useDirectSaleMutation
 * y habilita reimpresión con un botón de "Venta Exitosa".
 */
export function SaleSuccessPrintButton({
  orgSlug,
  payload,
  company,
  sale,
  className,
  onSaleCreated,
}: SaleSuccessPrintButtonProps) {
  const [isSaleSuccessful, setIsSaleSuccessful] = useState(false);

  const { isPrinting, printTicket } = usePrintTicket({
    defaultTitle: "Resumen de Venta",
  });

  const { createDirectSale } = useDirectSaleMutation(orgSlug, {
    onSuccess: async (result) => {
      setIsSaleSuccessful(true);
      printTicket({
        title: sale.saleNumber
          ? `Resumen de Venta ${sale.saleNumber}`
          : "Resumen de Venta",
      });
      await onSaleCreated?.(result);
    },
  });

  const handleCreateSale = async () => {
    setIsSaleSuccessful(false);
    await createDirectSale.mutateAsync(payload);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        className="w-full"
        disabled={createDirectSale.isPending}
        onClick={handleCreateSale}
        type="button"
      >
        {createDirectSale.isPending
          ? "Registrando venta..."
          : "Registrar venta"}
      </Button>

      {isSaleSuccessful ? (
        <Button
          className="w-full"
          disabled={isPrinting}
          onClick={() =>
            printTicket({
              title: sale.saleNumber
                ? `Resumen de Venta ${sale.saleNumber}`
                : "Resumen de Venta",
            })
          }
          type="button"
          variant="secondary"
        >
          {isPrinting ? "Imprimiendo..." : "Venta Exitosa: Imprimir ticket"}
        </Button>
      ) : null}

      <TicketReceipt company={company} sale={sale} />
    </div>
  );
}
