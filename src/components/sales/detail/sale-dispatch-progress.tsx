"use client";

import {
  CheckCircleIcon,
  FileTextIcon,
  PackageIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { OrderRemittanceMaskPrintModal } from "@/components/orders/order-remittance-mask-print-modal";
import { RemittancePreviewButton } from "@/components/sales/remittance-preview-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { SaleDispatchEvent } from "@/modules/orders/types";
import { useOrderRemittanceActions } from "@/modules/sales/hooks/use-order-remittance-actions";
import { useSaleDispatchProgress } from "@/modules/sales/hooks/use-sale-dispatch-progress";

type SaleDispatchProgressProps = {
  orgSlug: string;
  saleId: string;
};

type DispatchEventCardProps = {
  event: SaleDispatchEvent;
  orgSlug: string;
  orderLabel: string;
  downloadingEvent: string | null;
  generatingEvent: string | null;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (childOrderId: string, remitoNumber: string) => void;
};

function DispatchEventCard({
  event,
  orgSlug,
  orderLabel,
  downloadingEvent,
  generatingEvent,
  onDownload,
  onGenerate,
}: DispatchEventCardProps) {
  const key = `${event.child_order_id}-${event.remito_number}`;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileTextIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            Remito #{event.remito_number}
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          {formatDate(event.dispatched_at)}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        {event.child_orders.length > 1 ? `${orderLabel}s` : orderLabel}:{" "}
        {event.child_orders.map((child, index) => (
          <span key={child.id}>
            {index > 0 && ", "}
            <Link
              className="hover:underline"
              href={`/org/${orgSlug}/pedidos/${child.id}`}
            >
              {child.order_number}
            </Link>
          </span>
        ))}
      </p>
      {event.items.length > 0 && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {event.items.map((item) => (
            <div className="flex items-center gap-2 text-xs" key={item.id}>
              <PackageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
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
          <RemittancePreviewButton pdfUrl={event.remittance_pdf_url} />
          <Button
            disabled={downloadingEvent === key}
            onClick={() =>
              onDownload(event.child_order_id, event.remito_number)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {downloadingEvent === key ? (
              <>
                <Spinner className="mr-2 size-4" />
                Descargando...
              </>
            ) : (
              <>
                <FileTextIcon className="mr-2 h-4 w-4" />
                Descargar
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2 border-t pt-2">
          <Button
            disabled={generatingEvent === key}
            onClick={() =>
              onGenerate(event.child_order_id, event.remito_number)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {generatingEvent === key ? (
              <>
                <Spinner className="mr-2 size-4" />
                Generando...
              </>
            ) : (
              <>
                <FileTextIcon className="mr-2 h-4 w-4" />
                Generar remito
              </>
            )}
          </Button>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <OrderRemittanceMaskPrintModal
          childOrderId={event.child_order_id}
          orgSlug={orgSlug}
          remitoNumber={event.remito_number}
        />
      </div>
    </div>
  );
}

function standaloneSummaryText(
  completed: boolean,
  dispatched: boolean
): string {
  if (completed) {
    return "Pedido entregado";
  }
  if (dispatched) {
    return "Pedido despachado";
  }
  return "Pedido en proceso";
}

export function SaleDispatchProgress({
  orgSlug,
  saleId,
}: SaleDispatchProgressProps) {
  const { data } = useSaleDispatchProgress(orgSlug, saleId, true);
  const { downloadingEvent, generatingEvent, handleDownload, handleGenerate } =
    useOrderRemittanceActions({ orgSlug, saleId });

  if (!data) {
    return null;
  }

  const {
    total_children,
    dispatched_children,
    delivered_children,
    completed,
    standalone,
    events,
  } = data;
  const percentage =
    total_children > 0
      ? Math.round((delivered_children / total_children) * 100)
      : 0;

  let summaryText: string;
  if (standalone) {
    summaryText = standaloneSummaryText(completed, dispatched_children > 0);
  } else if (completed) {
    summaryText = `${total_children} sub-pedidos entregados`;
  } else {
    summaryText = `${delivered_children} de ${total_children} sub-pedidos entregados`;
  }
  const plural = dispatched_children === 1 ? "" : "s";
  const transitText = standalone
    ? "Pedido en tránsito"
    : `${dispatched_children} sub-pedido${plural} en tránsito`;
  const orderLabel = standalone ? "Pedido" : "Sub-pedido";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {completed ? (
            <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
          ) : (
            <TruckIcon className="h-5 w-5" />
          )}
          {completed ? "Despacho completado" : "Progreso de despacho"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">{summaryText}</p>
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
          <p className="text-muted-foreground text-xs">{transitText}</p>
        )}

        {events.length > 0 ? (
          <div className="space-y-3">
            {events.map((event) => (
              <DispatchEventCard
                downloadingEvent={downloadingEvent}
                event={event}
                generatingEvent={generatingEvent}
                key={`${event.child_order_id}-${event.remito_number}`}
                onDownload={handleDownload}
                onGenerate={handleGenerate}
                orderLabel={orderLabel}
                orgSlug={orgSlug}
              />
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
