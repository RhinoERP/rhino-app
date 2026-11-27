"use client";

import { PencilSimpleIcon, PlusIcon, XCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { WhatsAppApprovalShare } from "@/components/sales-quote-requests/whatsapp-approval-share";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { cancelSalesQuoteRequestAction } from "@/modules/sales-quote-requests/actions/cancel-sales-quote-request.action";
import type { ClientQuoteDraft } from "@/modules/sales-quote-requests/service/client-quote-drafts.service";
import type { MySalesQuoteRequest } from "@/modules/sales-quote-requests/service/my-sales-quote-requests.service";
import { canShareApprovalRequest } from "@/modules/sales-quote-requests/whatsapp-approval-share";

export function MySalesQuoteRequestsList({
  orgSlug,
  requests,
  drafts = [],
}: {
  orgSlug: string;
  requests: MySalesQuoteRequest[];
  drafts?: ClientQuoteDraft[];
}) {
  const [isNavigatingToNew, setIsNavigatingToNew] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl">Mis cotizaciones</h1>
          <p className="text-muted-foreground text-sm">
            Consultá el estado y el detalle de tus cotizaciones competitivas.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          {online ? (
            <Link
              aria-busy={isNavigatingToNew}
              href={`/org/${orgSlug}/solicitudes-venta/nueva`}
              onClick={() => setIsNavigatingToNew(true)}
            >
              {isNavigatingToNew ? (
                <>
                  <Spinner className="mr-2" /> Abriendo...
                </>
              ) : (
                <>
                  <PlusIcon className="mr-2 size-4" /> Cotizador competitivo
                </>
              )}
            </Link>
          ) : (
            <a href="/~offline/cotizaciones">
              <PlusIcon className="mr-2 size-4" /> Cotizador competitivo
            </a>
          )}
        </Button>
      </div>

      {drafts.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Cotizaciones para el cliente</CardTitle>
            <CardDescription>
              Borradores guardados en tu cuenta, aún no enviados a aprobación.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((draft) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
                key={draft.id}
              >
                <div>
                  <p className="font-medium">{draft.customer_name_snapshot}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatCurrency(draft.total_amount, draft.currency)} ·
                    Actualizada{" "}
                    {new Date(draft.updated_at).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/org/${orgSlug}/solicitudes-venta/nueva?draft=${draft.id}`}
                  >
                    Retomar cotización
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {requests.length === 0 ? (
        <Card className="min-w-0">
          <CardContent className="py-12 text-center">
            <p className="font-medium">Todavía no creaste cotizaciones</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Las cotizaciones que envíes aparecerán en este listado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Historial</CardTitle>
            <CardDescription>{requests.length} cotizaciones</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <table className="block w-full text-sm xl:table xl:table-fixed">
              <thead className="hidden xl:table-header-group">
                <tr className="border-b text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2 text-left align-middle font-medium">
                    Fecha
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Cliente
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Productos
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Total
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Estado
                  </th>
                  <th className="px-3 py-2 text-left align-middle font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="block xl:table-row-group">
                {requests.map((request) => (
                  <RequestRow
                    key={request.id}
                    orgSlug={orgSlug}
                    request={request}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RequestRow({
  orgSlug,
  request,
}: {
  orgSlug: string;
  request: MySalesQuoteRequest;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNavigatingToEdit, setIsNavigatingToEdit] = useState(false);
  const [cancelObservation, setCancelObservation] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const canCancel = ["PENDING_APPROVAL", "RETURNED"].includes(request.status);

  function cancel() {
    startTransition(async () => {
      const result = await cancelSalesQuoteRequestAction({
        orgSlug,
        requestId: request.id,
        observation: cancelObservation,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Cotización dada de baja");
      setCancelDialogOpen(false);
      setCancelObservation("");
      router.refresh();
    });
  }

  return (
    <tr className="mb-3 grid grid-cols-2 gap-x-3 rounded-lg border p-3 last:mb-0 xl:mb-0 xl:table-row xl:rounded-none xl:border-0 xl:border-b xl:p-0 xl:last:border-0">
      <td className="block min-w-0 px-0 py-2 text-left align-middle xl:table-cell xl:px-3 xl:py-3">
        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
          Fecha
        </span>
        {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(
          new Date(request.created_at)
        )}
      </td>
      <td className="col-span-2 block min-w-0 px-0 py-2 text-left align-middle xl:col-span-1 xl:table-cell xl:px-3 xl:py-3">
        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
          Cliente
        </span>
        <Link
          className="break-words font-medium hover:underline"
          href={`/org/${orgSlug}/solicitudes-venta/${request.id}`}
        >
          {request.customer_name}
        </Link>
        {request.review_comment && request.status === "RETURNED" && (
          <p className="mt-1 max-w-sm break-words text-muted-foreground text-xs">
            Corrección solicitada: {request.review_comment}
          </p>
        )}
      </td>
      <td className="block min-w-0 px-0 py-2 text-left align-middle xl:table-cell xl:px-3 xl:py-3">
        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
          Productos
        </span>
        {request.item_count}
      </td>
      <td className="block min-w-0 px-0 py-2 text-left align-middle xl:table-cell xl:px-3 xl:py-3">
        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
          Total
        </span>
        {formatCurrency(request.total_amount, request.currency)}
      </td>
      <td className="col-span-2 block min-w-0 px-0 py-2 text-left align-middle xl:col-span-1 xl:table-cell xl:px-3 xl:py-3">
        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
          Estado
        </span>
        <Badge variant={statusVariant(request.status)}>
          {statusLabel(request.status)}
        </Badge>
      </td>
      <td className="col-span-2 block min-w-0 px-0 py-2 text-left align-middle xl:col-span-1 xl:table-cell xl:px-3 xl:py-3">
        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
          Acciones
        </span>
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:whitespace-nowrap">
          {canShareApprovalRequest(request.status) && (
            <WhatsAppApprovalShare
              customerName={request.customer_name}
              orgSlug={orgSlug}
              requestId={request.id}
            />
          )}
          {canCancel && (
            <Button
              aria-label="Editar cotización"
              asChild
              size="icon"
              variant="outline"
            >
              <Link
                aria-busy={isNavigatingToEdit}
                href={`/org/${orgSlug}/solicitudes-venta/${request.id}/editar`}
                onClick={() => setIsNavigatingToEdit(true)}
              >
                {isNavigatingToEdit ? (
                  <Spinner className="size-4" />
                ) : (
                  <PencilSimpleIcon className="size-4" />
                )}
              </Link>
            </Button>
          )}
          {request.history.length > 0 && (
            <details className="order-last w-full text-left xl:relative xl:order-none xl:w-auto">
              <summary className="cursor-pointer py-2 text-primary text-sm hover:underline xl:py-0 xl:text-xs">
                Historial ({request.history.length})
              </summary>
              <div className="mt-2 max-h-[50vh] w-full overflow-y-auto rounded-md border bg-background p-3 shadow-sm xl:absolute xl:left-0 xl:z-10 xl:max-h-64 xl:w-72 xl:max-w-[calc(100vw-2rem)] xl:shadow-lg">
                {request.history.map((entry) => (
                  <div className="border-b py-2 last:border-0" key={entry.id}>
                    <p className="font-medium text-xs">
                      {new Intl.DateTimeFormat("es-AR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(entry.changed_at))}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {historyEventLabel(entry.event_type)} ·{" "}
                      {entry.items_snapshot.length} productos ·{" "}
                      {formatCurrency(
                        entry.request_snapshot.total_amount,
                        entry.request_snapshot.currency
                      )}
                    </p>
                    {entry.changed_by_name && (
                      <p className="text-muted-foreground text-xs">
                        Por {entry.changed_by_name}
                      </p>
                    )}
                    {entry.event_comment && (
                      <p className="mt-1 whitespace-pre-wrap text-xs">
                        {entry.event_comment}
                      </p>
                    )}
                    <ul className="mt-1 list-inside list-disc text-muted-foreground text-xs">
                      {entry.items_snapshot.map((item, index) => (
                        <li key={`${entry.id}-${index}`}>
                          {item.product_name_snapshot || "Producto"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
          {request.sales_order_id && (
            <Button asChild size="sm" variant="link">
              <Link href={`/org/${orgSlug}/ventas/${request.sales_order_id}`}>
                Ver preventa
              </Link>
            </Button>
          )}
          {!canCancel &&
            request.history.length === 0 &&
            !request.sales_order_id && (
              <span className="text-muted-foreground">—</span>
            )}
          {canCancel && (
            <AlertDialog
              onOpenChange={setCancelDialogOpen}
              open={cancelDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button
                  disabled={isPending}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <XCircleIcon className="mr-1 size-4" />
                  Dar de baja
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    ¿Está seguro que quiere dar de baja esta cotización?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    La solicitud se cancelará y ya no podrá aprobarse. Indicá el
                    motivo de la baja.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  aria-label="Observación de baja"
                  maxLength={2000}
                  onChange={(event) => setCancelObservation(event.target.value)}
                  placeholder="Observación de la baja (obligatoria)"
                  value={cancelObservation}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>
                    Volver
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isPending || !cancelObservation.trim()}
                    onClick={(event) => {
                      event.preventDefault();
                      cancel();
                    }}
                  >
                    {isPending ? (
                      <>
                        <Spinner className="mr-2" /> Dando de baja...
                      </>
                    ) : (
                      "Confirmar baja"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </td>
    </tr>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    PENDING_APPROVAL: "Pendiente de aprobación",
    RETURNED: "Devuelta para corrección",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    CONVERTED: "Aprobada · Preventa creada",
    CANCELLED: "Dada de baja",
  };
  return labels[status] ?? status;
}

function historyEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    PREVIOUS_VERSION: "Versión anterior",
    SUBMITTED: "Enviada a aprobación",
    EDITED: "Modificada y reenviada",
    RETURNED: "Devuelta para corrección",
    APPROVED: "Aprobada · Preventa creada",
    CANCELLED: "Dada de baja",
  };
  return labels[eventType] ?? "Actividad";
}

function statusVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "APPROVED" || status === "CONVERTED") {
    return "default";
  }
  if (status === "CANCELLED" || status === "REJECTED") {
    return "destructive";
  }
  if (status === "PENDING_APPROVAL") {
    return "secondary";
  }
  return "outline";
}
