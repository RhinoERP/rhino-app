"use client";

import { EnvelopeIcon } from "@phosphor-icons/react";
import { PackageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { statusStyles } from "@/components/quotes/quotes-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuoteDetails } from "@/modules/quotes/actions/get-quote-by-id.action";
import { sendQuoteEmailAction } from "@/modules/quotes/actions/send-quote-email.action";
import { updateQuoteStatusAction } from "@/modules/quotes/actions/update-quote-status.action";
import type { QuoteStatus } from "@/modules/quotes/types";

type QuoteStatusManagerProps = {
  orgSlug: string;
  quote: QuoteDetails;
  hasProduction: boolean;
  customerEmail: string | null;
  customerName: string;
};

export function QuoteStatusManager({
  orgSlug,
  quote,
  hasProduction,
  customerEmail,
  customerName,
}: QuoteStatusManagerProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleStatus = (newStatus: QuoteStatus) => {
    startTransition(async () => {
      const result = await updateQuoteStatusAction({
        orgSlug,
        quoteId: quote.id,
        newStatus,
      });
      if (result.success) {
        toast.success(`Presupuesto: ${statusStyles[newStatus].label}`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  };

  const handleConvertToOrder = () => {
    startTransition(async () => {
      const { createOrderFromQuoteAction } = await import(
        "@/modules/orders/actions/create-order.action"
      );
      const result = await createOrderFromQuoteAction(orgSlug, quote.id);
      if (result.success && result.orderId) {
        toast.success("Pedido creado — pasa a revisión de Finanzas");
        router.push(`/org/${orgSlug}/pedidos/${result.orderId}`);
      } else {
        toast.error(result.error ?? "Error al crear el pedido");
      }
    });
  };

  const handleSendEmail = () => {
    startTransition(async () => {
      if (!customerEmail) {
        toast.error("El cliente no tiene email registrado");
        return;
      }

      const result = await sendQuoteEmailAction({
        orgSlug,
        quoteId: quote.id,
        recipientEmail: customerEmail,
        recipientName: customerName,
      });

      if (result.success) {
        toast.success("Presupuesto enviado por email correctamente");
      } else {
        toast.error(result.error);
      }
    });
  };

  const config = statusStyles[quote.status as QuoteStatus];

  function getStatusBg(): string {
    if (quote.status === "APPROVED") {
      return "border-emerald-500/20 bg-emerald-500/10";
    }
    if (quote.status === "REJECTED") {
      return "border-rose-500/20 bg-rose-500/10";
    }
    if (quote.status === "DRAFT" || quote.status === "SENT") {
      return "border-border bg-muted/40";
    }
    return "border-border bg-muted/40";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado del presupuesto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estado actual */}
        <div className={`rounded-lg border px-4 py-3 ${getStatusBg()}`}>
          <p className="text-muted-foreground text-xs">Estado actual</p>
          <p
            className={`mt-1 font-semibold ${config?.className?.split(" ").find((c) => c.startsWith("text-")) ?? ""}`}
          >
            {config?.label ?? quote.status}
          </p>
        </div>

        {/* Acciones disponibles */}
        <div className="space-y-2">
          {quote.status === "DRAFT" && (
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() => handleStatus("SENT")}
              variant="outline"
            >
              Marcar como enviado al cliente
            </Button>
          )}

          {quote.status === "SENT" && (
            <>
              <Button
                className="w-full"
                disabled={isPending}
                onClick={() => handleStatus("APPROVED")}
              >
                Cliente aprobó el presupuesto
              </Button>
              <Button
                className="w-full"
                disabled={isPending}
                onClick={() => handleStatus("REJECTED")}
                variant="destructive"
              >
                Cliente rechazó el presupuesto
              </Button>
            </>
          )}

          {quote.status === "APPROVED" && hasProduction && (
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={isPending}
              onClick={handleConvertToOrder}
            >
              <PackageIcon className="mr-2 h-4 w-4" />
              Generar pedido
            </Button>
          )}

          {quote.status === "REJECTED" && (
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() => handleStatus("SENT")}
              variant="outline"
            >
              Reactivar presupuesto
            </Button>
          )}

          {quote.status === "CONVERTED" && (
            <p className="text-center text-muted-foreground text-sm">
              Este presupuesto ya fue convertido en pedido.
            </p>
          )}
        </div>

        {(quote.status === "DRAFT" ||
          quote.status === "SENT" ||
          quote.status === "REJECTED") &&
          customerEmail && (
            <Button
              className="w-full"
              disabled={isPending}
              onClick={handleSendEmail}
              variant="outline"
            >
              <EnvelopeIcon className="mr-2 h-4 w-4" />
              {isPending ? "Enviando..." : "Enviar por Email"}
            </Button>
          )}
      </CardContent>
    </Card>
  );
}
