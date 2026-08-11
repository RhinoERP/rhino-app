"use client";

import {
  ArrowFatLineLeftIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  FilePdfIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrdersRevertInfoMap } from "@/modules/orders/service/orders.service";
import type { OrderFlowStatus, OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";
import { RevertOrderModal } from "./revert-order-modal";

type FinanceOrdersReviewProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

export function FinanceOrdersReview({
  orders,
  orgSlug,
  revertInfoMap,
}: FinanceOrdersReviewProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircleIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Todo al día</EmptyTitle>
            <EmptyDescription>
              No hay pedidos pendientes de revisión financiera.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderReviewCard
          key={order.id}
          order={order}
          orgSlug={orgSlug}
          revertInfo={revertInfoMap[order.id]}
        />
      ))}
    </div>
  );
}

type OrderReviewCardProps = {
  order: OrderWithDetails;
  orgSlug: string;
  revertInfo: OrdersRevertInfoMap[string] | undefined;
};

function OrderReviewCard({ order, orgSlug, revertInfo }: OrderReviewCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [financeNotes, setFinanceNotes] = useState("");

  const isRejected = order.status === "FINANCE_REJECTED";
  const [revertOpen, setRevertOpen] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";
  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";

  function handleApprove() {
    setPendingAction("approve");
    startTransition(async () => {
      try {
        const result = await updateOrderStatusAction({
          orgSlug,
          orderId: order.id,
          newStatus: "PENDING_STOCK",
          notes: financeNotes,
        });

        if (result.success) {
          toast.success("Pedido aprobado para revisión de stock");
          setFinanceNotes("");
          router.refresh();
        } else {
          toast.error(`Error al aprobar el pedido: ${result.error}`);
        }
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleReject() {
    setPendingAction("reject");
    startTransition(async () => {
      try {
        const result = await updateOrderStatusAction({
          orgSlug,
          orderId: order.id,
          newStatus: "FINANCE_REJECTED",
          notes: financeNotes,
        });

        if (result.success) {
          toast.success("Pedido rechazado por Finanzas");
          setFinanceNotes("");
          router.refresh();
        } else {
          toast.error(`Error al rechazar el pedido: ${result.error}`);
        }
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow",
        isRejected && "border-rose-200 ring-1 ring-rose-100"
      )}
    >
      <CardHeader
        className={cn(
          "cursor-pointer gap-2 sm:flex-row sm:items-center sm:justify-between",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            className="font-mono font-semibold text-sm hover:underline"
            href={`/org/${orgSlug}/pedidos/${order.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {order.order_number}
          </Link>
          <OrderStatusBadge status={order.status} />
          <span className="truncate text-muted-foreground text-sm">
            {customerName}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {quote && (
            <span className="font-medium text-sm">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          {isExpanded ? (
            <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-4">
          {isRejected ? (
            <RejectedOrderContent
              canRevert={canRevert}
              isPending={isPending}
              onRevert={() => setRevertOpen(true)}
              onRevertOpenChange={setRevertOpen}
              order={order}
              orgSlug={orgSlug}
              previousStatus={previousStatus}
              previousStatusLabel={previousStatusLabel}
              refresh={router.refresh}
              revertOpen={revertOpen}
              revertType={revertType}
            />
          ) : (
            <ActiveOrderActions
              financeNotes={financeNotes}
              isPending={isPending}
              onApprove={handleApprove}
              onNotesChange={setFinanceNotes}
              onReject={handleReject}
              order={order}
              pendingAction={pendingAction}
            />
          )}

          {quote && quote.quote_items.length > 0 && (
            <div>
              <h4 className="mb-2 font-medium text-sm">
                Items del presupuesto
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pr-2 pb-1.5 text-left font-medium">
                        Descripción
                      </th>
                      <th className="px-2 pb-1.5 text-right font-medium">
                        Cant.
                      </th>
                      <th className="pb-1.5 pl-2 text-right font-medium">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.quote_items.map((item) => (
                      <tr className="border-b last:border-0" key={item.id}>
                        <td className="py-1.5 pr-2">{item.description}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">
                          {formatCurrency(item.subtotal, quote.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {order.purchase_order_file && (
            <Button asChild size="sm" variant="outline">
              <Link href={order.purchase_order_file} target="_blank">
                <FilePdfIcon className="mr-1.5 h-4 w-4 text-destructive" />
                Ver orden de compra
              </Link>
            </Button>
          )}

          {quote?.observations && (
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-muted-foreground text-xs">
                Observaciones del presupuesto
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">
                {quote.observations}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

type RejectedOrderContentProps = {
  canRevert: boolean;
  isPending: boolean;
  onRevert: () => void;
  order: OrderWithDetails;
  previousStatus: OrderFlowStatus | null;
  previousStatusLabel: string | null;
  revertType: "normal" | "undo_creation" | "cascade_revert";
  orgSlug: string;
  revertOpen: boolean;
  onRevertOpenChange: (open: boolean) => void;
  refresh: () => void;
};

function RejectedOrderContent({
  canRevert,
  isPending,
  onRevert,
  order,
  previousStatus,
  previousStatusLabel,
  revertType,
  orgSlug,
  revertOpen,
  onRevertOpenChange,
  refresh,
}: RejectedOrderContentProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-sm">
        Pedido rechazado por Finanzas
      </div>
      {canRevert && previousStatus && previousStatusLabel && (
        <>
          <div className="flex justify-end">
            <Button
              className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
              disabled={isPending}
              onClick={onRevert}
              size="sm"
              variant="outline"
            >
              <ArrowFatLineLeftIcon className="size-4" />
              Volver atrás
            </Button>
          </div>
          <RevertOrderModal
            onOpenChange={onRevertOpenChange}
            onSuccess={() => {
              refresh();
            }}
            open={revertOpen}
            orderId={order.id}
            orderNumber={order.order_number}
            orgSlug={orgSlug}
            previousStatus={previousStatus}
            previousStatusLabel={previousStatusLabel}
            revertType={revertType}
          />
        </>
      )}
    </div>
  );
}

type ActiveOrderActionsProps = {
  financeNotes: string;
  isPending: boolean;
  pendingAction: "approve" | "reject" | null;
  onApprove: () => void;
  onNotesChange: (value: string) => void;
  onReject: () => void;
  order: OrderWithDetails;
};

function ActiveOrderActions({
  financeNotes,
  isPending,
  pendingAction,
  onApprove,
  onNotesChange,
  onReject,
  order,
}: ActiveOrderActionsProps) {
  return (
    <>
      <div>
        <label
          className="mb-1 block font-medium text-sm"
          htmlFor={`notes-${order.id}`}
        >
          Notas del revisor
        </label>
        <Textarea
          id={`notes-${order.id}`}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Notas del revisor..."
          value={financeNotes}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={isPending} onClick={onReject} variant="destructive">
          <XCircleIcon className="size-4" />
          {isPending && pendingAction === "reject"
            ? "Rechazando..."
            : "Rechazar pedido"}
        </Button>
        <Button disabled={isPending} onClick={onApprove} variant="default">
          <CheckCircleIcon className="size-4" />
          {isPending && pendingAction === "approve"
            ? "Aprobando..."
            : "Aprobar pedido"}
        </Button>
      </div>
    </>
  );
}
