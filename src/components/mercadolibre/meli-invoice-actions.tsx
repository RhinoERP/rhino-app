"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import {
  downloadMeliInvoiceAction,
  emitMeliInvoiceAction,
  reconcileMeliInvoiceAction,
} from "@/modules/mercadolibre/actions/meli-invoice.action";

export function MeliInvoiceActions({
  orgSlug,
  saleId,
  status,
  canIssue,
}: {
  orgSlug: string;
  saleId: string;
  status: string;
  canIssue: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const running = useRef(false);
  function issue() {
    if (running.current) {
      return;
    }
    running.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await emitMeliInvoiceAction(orgSlug, saleId);
        if (!result.success) {
          setError(result.error);
        } else if (result.accountingWarning) {
          setError(
            `Factura autorizada; contabilización pendiente: ${result.accountingWarning}`
          );
        }
        router.refresh();
      } catch {
        setError(
          "No se pudo obtener la respuesta. Actualizá el detalle antes de reintentar la emisión."
        );
      } finally {
        running.current = false;
      }
    });
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canIssue && status !== "authorized" && (
          <Button
            disabled={pending || status === "pending"}
            onClick={issue}
            type="button"
          >
            {pending ? "Emitiendo…" : "Emitir / reintentar factura"}
          </Button>
        )}
        {status === "authorized" && (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError("");
                try {
                  const result = await downloadMeliInvoiceAction(
                    orgSlug,
                    saleId
                  );
                  if (!result.success) {
                    setError(result.error);
                    return;
                  }
                  await generatePDFFromHTML(
                    result.data.html,
                    result.data.filename
                  );
                } catch {
                  setError(
                    "No se pudo descargar la factura. Revisá la conexión y reintentá."
                  );
                }
              })
            }
            type="button"
            variant="outline"
          >
            Descargar factura PDF
          </Button>
        )}
        {canIssue && status === "pending" && (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError("");
                try {
                  const result = await reconcileMeliInvoiceAction(
                    orgSlug,
                    saleId
                  );
                  if (!result.success) {
                    setError(result.error);
                  } else if (result.accountingWarning) {
                    setError(
                      `Factura autorizada; contabilización pendiente: ${result.accountingWarning}`
                    );
                  }
                } catch {
                  setError(
                    "No se pudo consultar la reserva fiscal. Actualizá el detalle y reintentá la consulta."
                  );
                } finally {
                  router.refresh();
                }
              })
            }
            type="button"
            variant="outline"
          >
            Consultar autorización pendiente
          </Button>
        )}
      </div>
      {status === "pending" && (
        <p className="text-muted-foreground text-sm">
          La emisión está en curso o requiere conciliación. No se enviará otro
          comprobante mientras siga pendiente.
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
