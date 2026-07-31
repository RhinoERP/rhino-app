"use client";

import { CheckCircle, FileText, Package, Truck } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RemittancePreviewButton } from "@/components/sales/remittance-preview-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import { downloadOrderRemittanceAction } from "@/modules/orders/actions/download-order-remittance.action";
import { generateOrderRemittanceAction } from "@/modules/orders/actions/generate-order-remittance.action";
import { useSaleDispatchProgress } from "@/modules/sales/hooks/use-sale-dispatch-progress";
import { saleDispatchProgressKey } from "@/modules/sales/queries/query-keys";

type SaleDispatchProgressProps = {
  orgSlug: string;
  saleId: string;
};

export function SaleDispatchProgress({
  orgSlug,
  saleId,
}: SaleDispatchProgressProps) {
  const { data, isLoading } = useSaleDispatchProgress(orgSlug, saleId, true);
  const queryClient = useQueryClient();
  const [downloadingEvent, setDownloadingEvent] = useState<string | null>(null);
  const [generatingEvent, setGeneratingEvent] = useState<string | null>(null);

  const handleDownloadOrderRemittance = async (
    childOrderId: string,
    remitoNumber: string
  ) => {
    const key = `${childOrderId}-${remitoNumber}`;
    setDownloadingEvent(key);
    try {
      const result = await downloadOrderRemittanceAction(
        orgSlug,
        childOrderId,
        remitoNumber
      );
      if (!result.success) {
        throw new Error(result.error ?? "Error al descargar el remito");
      }
      const binary = window.atob(result.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Remito descargado correctamente");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error al descargar el remito";
      toast.error(errorMessage);
    } finally {
      setDownloadingEvent(null);
    }
  };

  const handleGenerateRemittance = async (
    childOrderId: string,
    remitoNumber: string
  ) => {
    const key = `${childOrderId}-${remitoNumber}`;
    setGeneratingEvent(key);
    try {
      const result = await generateOrderRemittanceAction(
        orgSlug,
        childOrderId,
        remitoNumber
      );
      if (!result.success) {
        throw new Error(result.error ?? "Error al generar el remito");
      }
      toast.success("Remito generado correctamente");
      await queryClient.invalidateQueries({
        queryKey: saleDispatchProgressKey(orgSlug, saleId),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error al generar el remito";
      toast.error(errorMessage);
    } finally {
      setGeneratingEvent(null);
    }
  };

  if (isLoading || !data) {
    return null;
  }

  const {
    total_children,
    dispatched_children,
    delivered_children,
    completed,
    events,
  } = data;
  const percentage =
    total_children > 0
      ? Math.round((delivered_children / total_children) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {completed ? (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          ) : (
            <Truck className="h-5 w-5" />
          )}
          {completed ? "Despacho completado" : "Progreso de despacho"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {completed
              ? `${total_children} sub-pedidos entregados`
              : `${delivered_children} de ${total_children} sub-pedidos entregados`}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                completed ? "bg-emerald-500" : "bg-primary"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {dispatched_children > 0 && (
          <p className="text-muted-foreground text-xs">
            {dispatched_children} sub-pedido
            {dispatched_children !== 1 ? "s" : ""} en tránsito
          </p>
        )}

        {events.length > 0 ? (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                className="rounded-lg border p-3"
                key={event.remito_number + event.child_order_id}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      Remito #{event.remito_number}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(event.dispatched_at)}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Sub-pedido:{" "}
                  <Link
                    className="hover:underline"
                    href={`/org/${orgSlug}/pedidos/${event.child_order_id}`}
                  >
                    {event.child_order_number}
                  </Link>
                </p>
                {event.items.length > 0 && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {event.items.map((item) => (
                      <div
                        className="flex items-center gap-2 text-xs"
                        key={item.id}
                      >
                        <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span>{item.description}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums">
                          ×{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {event.remittance_pdf_url ? (
                  <div className="mt-2 flex gap-2 border-t pt-2">
                    <RemittancePreviewButton
                      pdfUrl={event.remittance_pdf_url}
                    />
                    <Button
                      disabled={
                        downloadingEvent ===
                        `${event.child_order_id}-${event.remito_number}`
                      }
                      onClick={() =>
                        handleDownloadOrderRemittance(
                          event.child_order_id,
                          event.remito_number
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {downloadingEvent ===
                      `${event.child_order_id}-${event.remito_number}` ? (
                        <>
                          <Spinner className="mr-2 size-4" />
                          Descargando...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Descargar
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2 border-t pt-2">
                    <Button
                      disabled={
                        generatingEvent ===
                        `${event.child_order_id}-${event.remito_number}`
                      }
                      onClick={() =>
                        handleGenerateRemittance(
                          event.child_order_id,
                          event.remito_number
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {generatingEvent ===
                      `${event.child_order_id}-${event.remito_number}` ? (
                        <>
                          <Spinner className="mr-2 size-4" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Generar remito
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-muted-foreground text-sm">
            Sin envíos registrados
          </p>
        )}
      </CardContent>
    </Card>
  );
}
