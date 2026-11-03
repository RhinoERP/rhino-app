import { notFound } from "next/navigation";
import { SalesQuoteRequestBackButton } from "@/components/sales-quote-requests/sales-quote-request-back-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { requireAuth } from "@/lib/supabase/auth";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOwnSalesQuoteRequestDetails } from "@/modules/sales-quote-requests/service/my-sales-quote-requests.service";

type SalesQuoteRequestDetailPageProps = {
  params: Promise<{ orgSlug: string; requestId: string }>;
};

export default async function SalesQuoteRequestDetailPage({
  params,
}: SalesQuoteRequestDetailPageProps) {
  const { orgSlug, requestId } = await params;
  await guardOrganizationPermissionAccess(orgSlug, [
    "sales.manage",
    "sales.manage.all",
  ]);
  const auth = await requireAuth();
  if (!auth) {
    notFound();
  }
  const request = await getOwnSalesQuoteRequestDetails({
    orgSlug,
    requestId,
    userId: auth.userId,
  });
  if (!request) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SalesQuoteRequestBackButton
          href={`/org/${orgSlug}/solicitudes-venta`}
        />
        <div>
          <h1 className="font-heading text-2xl">Detalle de cotización</h1>
          <p className="text-muted-foreground text-sm">
            {request.customer_name} · {formatDate(request.created_at)}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{request.customer_name}</CardTitle>
              <CardDescription>
                Vendedor: {request.seller_name_snapshot || "—"}
                {request.seller_zone_snapshot
                  ? ` · Zona ${request.seller_zone_snapshot}`
                  : ""}
              </CardDescription>
            </div>
            <Badge
              variant={
                request.status === "CANCELLED" ? "destructive" : "secondary"
              }
            >
              {statusLabel(request.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail
              label="Segmento"
              value={segmentLabel(request.customer_segment)}
            />
            <Detail label="Moneda" value={request.currency} />
            <Detail
              label="Forma de pago"
              value={request.payment_method || "—"}
            />
            <Detail label="Plazo" value={request.payment_term || "—"} />
            <Detail label="Comprobante" value={request.invoice_type || "—"} />
            {request.exchange_rate != null && (
              <Detail
                label="Tipo de cambio"
                value={request.exchange_rate.toLocaleString("es-AR")}
              />
            )}
          </div>

          {request.cancellation_observation && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="font-medium text-sm">Observación de baja</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                {request.cancellation_observation}
              </p>
            </div>
          )}
          {request.review_comment && (
            <div className="rounded-md border p-4">
              <p className="font-medium text-sm">Comentario de revisión</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                {request.review_comment}
              </p>
            </div>
          )}
          {request.seller_observations && (
            <div className="rounded-md border p-4">
              <p className="font-medium text-sm">Observaciones</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                {request.seller_observations}
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="p-3 font-medium">Producto</th>
                  <th className="p-3 text-right font-medium">Cantidad</th>
                  <th className="p-3 text-right font-medium">Precio base</th>
                  <th className="p-3 text-right font-medium">Modalidad</th>
                  <th className="p-3 text-right font-medium">
                    Precio acordado
                  </th>
                  <th className="p-3 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="p-3">
                      <p className="font-medium">
                        {item.product_name_snapshot}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {item.sku_snapshot || "Sin SKU"}
                        {item.product_comment
                          ? ` · ${item.product_comment}`
                          : ""}
                      </p>
                    </td>
                    <td className="p-3 text-right">
                      {item.quantity.toLocaleString("es-AR")}{" "}
                      {item.unit_of_measure_snapshot || ""}
                    </td>
                    <td className="p-3 text-right">
                      {formatCurrency(item.base_unit_price, request.currency)}
                    </td>
                    <td className="p-3 text-right">
                      {pricingMethodLabel(item.pricing_method)}
                      {item.pricing_method === "COMPETITOR" && (
                        <p className="text-muted-foreground text-xs">
                          {formatCurrency(
                            item.competitor_unit_price,
                            request.currency
                          )}
                        </p>
                      )}
                      {item.pricing_method === "PERCENTAGE" && (
                        <p className="text-muted-foreground text-xs">
                          {item.discount_percentage.toLocaleString("es-AR", {
                            maximumFractionDigits: 2,
                          })}
                          % de descuento
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {formatCurrency(item.agreed_unit_price, request.currency)}
                    </td>
                    <td className="p-3 text-right">
                      {formatCurrency(item.line_subtotal, request.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-6 border-t pt-4 text-sm">
            <Detail
              label="Subtotal"
              value={formatCurrency(request.subtotal_amount, request.currency)}
            />
            <Detail
              label="Impuestos"
              value={formatCurrency(request.tax_amount, request.currency)}
            />
            <Detail
              label="Total"
              strong
              value={formatCurrency(request.total_amount, request.currency)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={strong ? "font-semibold" : "font-medium"}>{value}</p>
    </div>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(
    new Date(date)
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_APPROVAL: "Pendiente de aprobación",
    RETURNED: "Devuelta para corrección",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    CONVERTED: "Convertida",
    CANCELLED: "Dada de baja",
  };
  return labels[status] ?? status;
}

function segmentLabel(segment: string): string {
  if (segment === "NEW") {
    return "Nuevo";
  }
  if (segment === "REACTIVATED") {
    return "Reactivado";
  }
  return "Activo";
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
