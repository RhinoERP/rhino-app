"use client";

import {
  CaretDownIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { reviewSalesQuoteRequestAction } from "@/modules/sales-quote-requests/actions/review-sales-quote-request.action";
import type {
  SalesQuoteRequestReview,
  SalesQuoteRequestReviewItem,
} from "@/modules/sales-quote-requests/service/review-sales-quote-requests.service";

type SalesQuoteRequestReviewQueueProps = {
  orgSlug: string;
  requests: SalesQuoteRequestReview[];
};

export function SalesQuoteRequestReviewQueue({
  orgSlug,
  requests,
}: SalesQuoteRequestReviewQueueProps) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircleIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">No hay solicitudes pendientes</p>
          <p className="text-muted-foreground text-sm">
            Las nuevas solicitudes del cotizador competitivo aparecerán aquí.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {requests.map((request) => (
        <RequestReviewCard
          key={request.id}
          orgSlug={orgSlug}
          request={request}
        />
      ))}
    </div>
  );
}

function RequestReviewCard({
  orgSlug,
  request,
}: {
  orgSlug: string;
  request: SalesQuoteRequestReview;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingDecision, setPendingDecision] = useState<
    "APPROVED" | "RETURNED" | null
  >(null);

  function review(decision: "APPROVED" | "RETURNED") {
    if (decision === "RETURNED" && !comment.trim()) {
      toast.error("Escribí un comentario para indicar qué debe corregirse");
      return;
    }

    startTransition(async () => {
      setPendingDecision(decision);
      const result = await reviewSalesQuoteRequestAction({
        orgSlug,
        requestId: request.id,
        decision,
        comment,
      });
      if (!result.success) {
        setPendingDecision(null);
        toast.error(result.error);
        return;
      }

      toast.success(
        decision === "APPROVED"
          ? "Solicitud aprobada y preventa creada"
          : "Solicitud devuelta para corrección"
      );
      setPendingDecision(null);
      router.refresh();
    });
  }

  const createdAt = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(request.created_at));
  const totalCost = request.items.reduce(
    (sum, item) => sum + (item.unit_cost_snapshot ?? 0) * item.quantity,
    0
  );
  const hasMissingCost = request.items.some(
    (item) => item.unit_cost_snapshot == null
  );
  const generalMarkup =
    hasMissingCost || totalCost <= 0
      ? null
      : ((request.subtotal_amount - totalCost) / totalCost) * 100;

  return (
    <details className="group w-full min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <summary className="cursor-pointer list-none space-y-4 p-3 marker:hidden sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold">{request.customer_name}</p>
            <p className="break-words text-muted-foreground text-xs">
              {request.seller_name_snapshot || "—"} · {createdAt}
            </p>
          </div>
          <div className="flex max-w-full items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-amber-700 text-xs dark:text-amber-300">
            <ClockIcon className="size-4" />
            Pendiente de aprobación
            <CaretDownIcon className="ml-1 size-4 transition-transform group-open:rotate-180" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-5 min-[420px]:grid-cols-2">
          <Summary
            label="Subtotal costo"
            value={
              hasMissingCost
                ? "Costo no disponible"
                : formatCurrency(totalCost, request.currency)
            }
          />
          <Summary
            label="Markup general"
            value={
              generalMarkup == null
                ? "—"
                : `${formatPercentage(generalMarkup)}%`
            }
          />
          <Summary
            label="Subtotal"
            value={formatCurrency(request.subtotal_amount, request.currency)}
          />
          <Summary
            label="Impuestos"
            value={formatCurrency(request.tax_amount, request.currency)}
          />
          <Summary
            label="Total presupuesto"
            strong
            value={formatCurrency(request.total_amount, request.currency)}
          />
        </div>
      </summary>
      <CardContent className="min-w-0 space-y-5 border-t p-3 pt-4 sm:p-5">
        <div className="grid min-w-0 gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Summary
            label="Segmento"
            value={segmentLabel(request.customer_segment)}
          />
          <Summary label="Moneda" value={request.currency} />
          <Summary
            label="Forma de pago"
            value={request.payment_method || "—"}
          />
          <Summary label="Plazo" value={request.payment_term || "—"} />
          <Summary label="Comprobante" value={request.invoice_type || "—"} />
          {request.exchange_rate != null && (
            <Summary
              label="Tipo de cambio"
              value={request.exchange_rate.toLocaleString("es-AR")}
            />
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {request.items.map((item) => (
            <RequestItemReview
              currency={request.currency}
              item={item}
              key={item.id}
            />
          ))}
        </div>
        {request.seller_observations && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Observaciones del vendedor</p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {request.seller_observations}
            </p>
          </div>
        )}

        <div className="space-y-3 border-t pt-4">
          <Textarea
            aria-label="Comentario de revisión"
            maxLength={2000}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Comentario para el vendedor (obligatorio si se devuelve)"
            value={comment}
          />
          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              disabled={isPending}
              onClick={() => review("RETURNED")}
              type="button"
              variant="outline"
            >
              {pendingDecision === "RETURNED" ? (
                <>
                  <Spinner className="mr-2" /> Devolviendo...
                </>
              ) : (
                "Devolver para corrección"
              )}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isPending}
              onClick={() => review("APPROVED")}
              type="button"
            >
              {pendingDecision === "APPROVED" ? (
                <>
                  <Spinner className="mr-2" /> Aprobando...
                </>
              ) : (
                "Aprobar solicitud"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </details>
  );
}

function RequestItemReview({
  currency,
  item,
}: {
  currency: string;
  item: SalesQuoteRequestReviewItem;
}) {
  const markup = markupPercentage(item);

  return (
    <div className="min-w-0 rounded-md border p-3 sm:p-4">
      <div className="mb-3 flex min-w-0 flex-col items-start justify-between gap-1 sm:flex-row sm:gap-x-4">
        <div className="min-w-0">
          <p className="break-words font-medium">
            {item.product_name_snapshot}
          </p>
          <p className="text-muted-foreground text-xs">
            {item.sku_snapshot || "Sin SKU"}
            {item.product_comment ? ` · ${item.product_comment}` : ""}
          </p>
        </div>
        <p className="max-w-full text-muted-foreground text-sm sm:shrink-0 sm:text-right">
          Cantidad: {item.quantity.toLocaleString("es-AR")}{" "}
          {item.unit_of_measure_snapshot || ""}
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-5 min-[360px]:grid-cols-2">
        <Metric
          label="Precio base"
          value={formatCurrency(item.base_unit_price, currency)}
        />
        <Metric
          label="Modalidad"
          value={pricingMethodLabel(item.pricing_method)}
        />
        {item.pricing_method === "COMPETITOR" && (
          <Metric
            label="Precio competencia"
            value={formatCurrency(item.competitor_unit_price, currency)}
          />
        )}
        {item.pricing_method === "PERCENTAGE" && (
          <Metric
            label="Descuento aplicado"
            value={`${formatPercentage(item.discount_percentage)}%`}
          />
        )}
        <Metric
          label={
            item.pricing_method === "LIST_PRICE"
              ? "Precio de lista"
              : "Precio final"
          }
          strong
          value={`${formatCurrency(item.agreed_unit_price, currency)} · ${adjustmentLabel(item, currency)}`}
        />
        <Metric
          label="Dto. para igualar"
          value={discountLabel(item, currency)}
        />
        <Metric
          label="Costo unitario"
          value={formatCurrencyOrDash(item.unit_cost_snapshot, currency)}
        />
        <Metric
          label="Markup ganancia"
          value={formatMarkup(markup)}
          valueClassName={markupColor(markup)}
        />
        <Metric
          label="Subtotal costo"
          value={formatCurrencyOrDash(
            item.unit_cost_snapshot == null
              ? null
              : item.unit_cost_snapshot * item.quantity,
            currency
          )}
        />
      </div>
    </div>
  );
}

function discountLabel(
  item: SalesQuoteRequestReviewItem,
  currency: string
): string {
  if (item.adjustment_type !== "DISCOUNT") {
    return "0%";
  }
  return `${formatPercentage(item.discount_percentage)}% · ${formatCurrency(item.discount_amount, currency)}`;
}

function pricingMethodLabel(method: string): string {
  if (method === "PERCENTAGE") {
    return "Por porcentaje";
  }
  if (method === "LIST_PRICE") {
    return "Precio lista";
  }
  return "Por precio competencia";
}

function formatCurrencyOrDash(value: number | null, currency: string): string {
  return value == null ? "—" : formatCurrency(value, currency);
}

function formatMarkup(value: number | null): string {
  return value == null ? "—" : `${formatPercentage(value)}%`;
}

function formatPercentage(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function markupColor(value: number | null): string | undefined {
  if (value == null || value === 0) {
    return;
  }
  return value > 0 ? "text-green-600" : "text-red-600";
}

function Summary({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="min-w-0 break-words text-muted-foreground text-xs">
        {label}
      </span>
      <span
        className={`min-w-0 break-words ${strong ? "font-semibold" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  strong = false,
  valueClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 px-2.5 py-2 sm:px-3">
      <p className="truncate text-muted-foreground text-xs" title={label}>
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm ${strong ? "font-semibold" : "font-medium"} ${valueClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function segmentLabel(segment: string): string {
  switch (segment) {
    case "NEW":
      return "Nuevo";
    case "REACTIVATED":
      return "Reactivado";
    default:
      return "Activo";
  }
}

function adjustmentLabel(
  item: SalesQuoteRequestReview["items"][number],
  currency: string
): string {
  if (item.adjustment_type === "DISCOUNT") {
    return `Descuento ${formatPercentage(item.discount_percentage)}%`;
  }
  if (item.adjustment_type === "PRICE_OVERRIDE") {
    return `Aumento ${formatCurrency(item.price_increase_amount, currency)}`;
  }
  return "Sin ajuste";
}

function markupPercentage(
  item: SalesQuoteRequestReview["items"][number]
): number | null {
  if (item.unit_cost_snapshot == null || item.unit_cost_snapshot <= 0) {
    return null;
  }
  return (
    ((item.agreed_unit_price - item.unit_cost_snapshot) /
      item.unit_cost_snapshot) *
    100
  );
}
