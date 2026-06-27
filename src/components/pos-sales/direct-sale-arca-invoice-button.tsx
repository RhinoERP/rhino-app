"use client";

import { ReceiptIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emitPosSaleInvoiceAction } from "@/modules/arca/actions/emit-pos-sale-invoice.action";

type PosArcaInvoiceType = "FACTURA_B" | "FACTURA_C";

type DirectSaleArcaInvoiceButtonProps = {
  orgSlug: string;
  posSaleId: string;
  invoiceType: PosArcaInvoiceType | null;
  disabledReason?: string | null;
};

export function DirectSaleArcaInvoiceButton({
  orgSlug,
  posSaleId,
  invoiceType,
  disabledReason,
}: DirectSaleArcaInvoiceButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isDisabled = isPending || !invoiceType;

  const handleClick = () => {
    if (!invoiceType) {
      const message =
        disabledReason ??
        "Configurá el tipo de comprobante de venta directa como Factura B o C antes de emitir.";
      setError(message);
      toast.error(message);
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const result = await emitPosSaleInvoiceAction({
          orgSlug,
          posSaleId,
          invoiceType,
        });

        if (!result.success) {
          setError(result.error);
          toast.error(result.error);
          router.refresh();
          return;
        }

        toast.success("Factura ARCA emitida correctamente");
        router.refresh();
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "No se pudo emitir la factura ARCA.";
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="w-full space-y-2">
      <Button
        className="w-full justify-between"
        disabled={isDisabled}
        onClick={handleClick}
        type="button"
      >
        <div className="flex items-center">
          <ReceiptIcon className="mr-2 size-4" weight="bold" />
          {isPending ? "Emitiendo..." : "Emitir Factura ARCA"}
        </div>
      </Button>
      {(error || (!invoiceType && disabledReason)) && (
        <p className="text-red-600 text-xs">{error ?? disabledReason}</p>
      )}
    </div>
  );
}
