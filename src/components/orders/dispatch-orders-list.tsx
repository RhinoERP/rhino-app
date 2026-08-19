"use client";

import {
  ArrowElbowDownRightIcon,
  ArrowFatLineLeftIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  FileTextIcon,
  PackageIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { OrderRemittanceMaskPrintModal } from "@/components/orders/order-remittance-mask-print-modal";
import { RemittancePreviewButton } from "@/components/sales/remittance-preview-button";
import { ItemExtrasList } from "@/components/shared/item-extras-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { dispatchChildOrderAction } from "@/modules/orders/actions/dispatch-child-order.action";
import { downloadOrderRemittanceAction } from "@/modules/orders/actions/download-order-remittance.action";
import { generateOrderRemittanceAction } from "@/modules/orders/actions/generate-order-remittance.action";
import type { OrderDispatchEventSummary } from "@/modules/orders/actions/get-order-dispatch-events.action";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import { useOrderDispatchEvents } from "@/modules/orders/hooks/use-order-dispatch-events";
import type { OrdersRevertInfoMap } from "@/modules/orders/service/orders.service";
import type { ChildOrderForDispatch } from "@/modules/orders/types";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { Textarea } from "../ui/textarea";
import { OrderStatusBadge } from "./order-status-badge";
import { RevertOrderModal } from "./revert-order-modal";

function getRemitoPlaceholder(
  isGenerating: boolean,
  autoNumbering: boolean,
  previewNumber: string
): string {
  if (isGenerating) {
    return "Generando...";
  }
  if (autoNumbering && previewNumber) {
    return previewNumber;
  }
  return "Número de remito";
}

function groupByParent(
  orders: ChildOrderForDispatch[]
): Map<string, ChildOrderForDispatch[]> {
  const map = new Map<string, ChildOrderForDispatch[]>();
  for (const o of orders) {
    const group = map.get(o.parent_order_id);
    if (group) {
      group.push(o);
    } else {
      map.set(o.parent_order_id, [o]);
    }
  }
  return map;
}

type DispatchOrdersListProps = {
  orders: ChildOrderForDispatch[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

export function DispatchOrdersList({
  orders,
  orgSlug,
  revertInfoMap,
}: DispatchOrdersListProps) {
  const preparing = orders.filter((o) => o.status === "PREPARING");
  const dispatched = orders.filter((o) => o.status === "DISPATCHED");
  const delivered = orders.filter((o) => o.status === "DELIVERED");

  const dispatchOrderIds = [...dispatched, ...delivered].map((o) => o.id);
  const { data: dispatchEvents = [] } = useOrderDispatchEvents(
    orgSlug,
    dispatchOrderIds
  );
  const dispatchEventsByOrder = new Map(
    dispatchEvents.map((ev) => [ev.child_order_id, ev])
  );

  const [downloadingRemito, setDownloadingRemito] = useState<string | null>(
    null
  );
  const [generatingRemito, setGeneratingRemito] = useState<string | null>(null);
  const [localPdfUrls, setLocalPdfUrls] = useState<Map<string, string>>(
    new Map()
  );

  const effectiveDispatchEventsByOrder = new Map(dispatchEventsByOrder);
  for (const [childOrderId, pdfUrl] of localPdfUrls) {
    const existing = effectiveDispatchEventsByOrder.get(childOrderId);
    if (existing) {
      effectiveDispatchEventsByOrder.set(childOrderId, {
        ...existing,
        remittance_pdf_url: pdfUrl,
      });
    }
  }

  const handleDownloadRemito = async (
    childOrderId: string,
    remitoNumber: string
  ) => {
    const key = `${childOrderId}-${remitoNumber}`;
    setDownloadingRemito(key);
    try {
      const result = await downloadOrderRemittanceAction(
        orgSlug,
        childOrderId,
        remitoNumber
      );
      if (!result.success) {
        throw new Error(result.error ?? "Error al descargar el remito");
      }
      if (result.pdfUrl) {
        setLocalPdfUrls((prev) => {
          const next = new Map(prev);
          if (result.pdfUrl) {
            next.set(childOrderId, result.pdfUrl);
          }
          return next;
        });
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
      toast.error(
        error instanceof Error ? error.message : "Error al descargar el remito"
      );
    } finally {
      setDownloadingRemito(null);
    }
  };

  const handleGenerateRemito = async (orderId: string) => {
    setGeneratingRemito(orderId);
    try {
      const result = await generateOrderRemittanceAction(orgSlug, orderId);
      if (result.success) {
        toast.success("Remito generado correctamente");
        const url = result.pdfUrl;
        if (url) {
          setLocalPdfUrls((prev) => {
            const next = new Map(prev);
            next.set(orderId, url);
            return next;
          });
        }
      } else {
        throw new Error(result.error ?? "Error al generar el remito");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al generar el remito"
      );
    } finally {
      setGeneratingRemito(null);
    }
  };

  if (
    preparing.length === 0 &&
    dispatched.length === 0 &&
    delivered.length === 0
  ) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin pedidos en despacho</EmptyTitle>
            <EmptyDescription>
              No hay pedidos en preparación, despachados o entregados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DispatchSection
        count={preparing.length}
        icon={PackageIcon}
        title="Preparando"
      >
        <GroupedOrders
          orders={preparing}
          orgSlug={orgSlug}
          renderChild={(child) => (
            <PreparingChildCard
              child={child}
              key={child.id}
              orgSlug={orgSlug}
              revertInfo={revertInfoMap[child.id]}
            />
          )}
          revertInfoMap={revertInfoMap}
        />
      </DispatchSection>

      <DispatchSection
        count={dispatched.length}
        icon={TruckIcon}
        title="Despachados"
      >
        <GroupedOrders
          orders={dispatched}
          orgSlug={orgSlug}
          renderChild={(child) => (
            <DispatchedChildCard
              child={child}
              dispatchEvent={effectiveDispatchEventsByOrder.get(child.id)}
              downloadingRemito={downloadingRemito}
              generatingRemito={generatingRemito}
              key={child.id}
              onDownload={handleDownloadRemito}
              onGenerate={handleGenerateRemito}
              orgSlug={orgSlug}
              revertInfo={revertInfoMap[child.id]}
            />
          )}
          revertInfoMap={revertInfoMap}
        />
      </DispatchSection>

      <DispatchSection
        count={delivered.length}
        icon={CheckCircleIcon}
        title="Entregados"
      >
        <GroupedOrders
          orders={delivered}
          orgSlug={orgSlug}
          renderChild={(child) => (
            <DeliveredChildCard
              child={child}
              dispatchEvent={effectiveDispatchEventsByOrder.get(child.id)}
              downloadingRemito={downloadingRemito}
              generatingRemito={generatingRemito}
              key={child.id}
              onDownload={handleDownloadRemito}
              onGenerate={handleGenerateRemito}
              orgSlug={orgSlug}
              revertInfo={revertInfoMap[child.id]}
            />
          )}
          revertInfoMap={revertInfoMap}
        />
      </DispatchSection>
    </div>
  );
}

type GroupedOrdersProps = {
  orders: ChildOrderForDispatch[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
  renderChild: (child: ChildOrderForDispatch) => React.ReactNode;
};

function GroupedOrders({
  orders,
  orgSlug,
  revertInfoMap: _revertInfoMap,
  renderChild,
}: GroupedOrdersProps) {
  const grouped = useMemo(() => groupByParent(orders), [orders]);

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([parentId, groupOrders]) => (
        <ParentGroup
          key={parentId}
          orders={groupOrders}
          orgSlug={orgSlug}
          parentId={parentId}
        >
          {groupOrders.map(renderChild)}
        </ParentGroup>
      ))}
    </div>
  );
}

type ParentGroupProps = {
  parentId: string;
  orders: ChildOrderForDispatch[];
  orgSlug: string;
  children: React.ReactNode;
};

function ParentGroup({
  parentId,
  orders,
  orgSlug,
  children,
}: ParentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const first = orders[0];
  const isUnified = orders.length === 1 && orders[0].id === parentId;

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden">
        <CardHeader
          className={cn(
            "cursor-pointer gap-2 sm:flex-row sm:items-center sm:justify-between",
            isExpanded && "border-b"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-medium text-sm">
              {first.parent_customer_name}
            </span>
            <Link
              className="shrink-0 font-mono text-muted-foreground text-xs hover:underline"
              href={`/org/${orgSlug}/pedidos/${parentId}`}
              onClick={(e) => e.stopPropagation()}
            >
              {first.parent_order_number}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {!isUnified && (
              <span className="text-muted-foreground text-xs">
                {orders.length} {orders.length === 1 ? "envío" : "envíos"}
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
          <CardContent className="space-y-3 pt-4">{children}</CardContent>
        )}
      </Card>
    </div>
  );
}

type PreparingChildCardProps = {
  child: ChildOrderForDispatch;
  orgSlug: string;
  revertInfo: OrdersRevertInfoMap[string] | undefined;
};

function PreparingChildCard({
  child,
  orgSlug,
  revertInfo,
}: PreparingChildCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const [remitoNumber, setRemitoNumber] = useState("");
  const [autoNumbering, setAutoNumbering] = useState(false);
  const [previewNumber, setPreviewNumber] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";
  const generatedRef = useRef(false);

  useEffect(() => {
    if (!isExpanded || generatedRef.current) {
      return;
    }
    generatedRef.current = true;

    getRemittanceSettings(orgSlug).then((settings) => {
      if (settings.success && settings.data?.autoEnabled) {
        setAutoNumbering(true);
        const nextNumber = settings.data.lastNumber + 1;
        const padded = String(nextNumber).padStart(5, "0");
        const preview = settings.data.prefix
          ? `${settings.data.prefix}-${padded}`
          : padded;
        setPreviewNumber(preview);
      }
      setIsGenerating(false);
    });
  }, [orgSlug, isExpanded]);

  function handleDispatch() {
    const finalNumber = remitoNumber.trim();

    if (!(finalNumber || autoNumbering)) {
      toast.error("El número de remito es obligatorio");
      return;
    }

    startTransition(async () => {
      let remitoToUse = finalNumber;

      if (autoNumbering && !finalNumber) {
        setIsGenerating(true);
        const result = await generateRemittanceNumber(orgSlug);
        if (result.success && result.number) {
          remitoToUse = result.number;
        } else {
          toast.error("Error al generar número de remito");
          setIsGenerating(false);
          return;
        }
        setIsGenerating(false);
      }

      const dispatchResult = await dispatchChildOrderAction({
        orgSlug,
        childOrderId: child.id,
        remitoNumber: remitoToUse,
      });

      if (dispatchResult.success) {
        toast.success(`Despachado — Remito ${remitoToUse}`);
        setRemitoNumber("");
        setPreviewNumber("");
        setAutoNumbering(false);
        generatedRef.current = false;
        router.refresh();
      } else {
        toast.error(`Error al despachar: ${dispatchResult.error}`);
      }
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader
        className={cn(
          "flex cursor-pointer flex-row items-center gap-2 py-2.5",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ArrowElbowDownRightIcon className="size-4 shrink-0 text-muted-foreground" />
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${child.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {child.order_number}
        </Link>
        <OrderStatusBadge status={child.status} />
        <div className="flex-1" />
        {isExpanded ? (
          <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0 pb-3">
          {child.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pr-2 pb-1 text-left font-medium">
                      Producto
                    </th>
                    <th className="pb-1 pl-2 text-right font-medium">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {child.items.map((item) => (
                    <tr className="border-b last:border-0" key={item.id}>
                      <td className="py-1 pr-2">
                        {item.description}
                        <ItemExtrasList
                          extras={item.quote_item_extras}
                          showPrice={false}
                        />
                      </td>
                      <td className="py-1 pl-2 text-right tabular-nums">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <label
                className="mb-1 block font-medium text-sm"
                htmlFor={`remito-${child.id}`}
              >
                Número de remito
              </label>
              <Input
                disabled={isGenerating || isPending}
                id={`remito-${child.id}`}
                onChange={(e) => setRemitoNumber(e.target.value)}
                placeholder={getRemitoPlaceholder(
                  isGenerating,
                  autoNumbering,
                  previewNumber
                )}
                value={remitoNumber}
              />
            </div>

            <div className="flex items-center gap-2">
              {canRevert && (
                <Button
                  className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
                  disabled={isPending || isGenerating}
                  onClick={() => setRevertOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <ArrowFatLineLeftIcon className="size-4" />
                  Volver atrás
                </Button>
              )}
              <Button
                disabled={isPending || isGenerating}
                onClick={handleDispatch}
                size="sm"
              >
                <TruckIcon className="mr-1 h-4 w-4" />
                {isPending ? "Despachando..." : "Despachar"}
              </Button>
            </div>
          </div>

          {canRevert && previousStatus && previousStatusLabel && (
            <RevertOrderModal
              onOpenChange={setRevertOpen}
              onSuccess={() => router.refresh()}
              open={revertOpen}
              orderId={child.id}
              orderNumber={child.order_number}
              orgSlug={orgSlug}
              previousStatus={previousStatus}
              previousStatusLabel={previousStatusLabel}
              revertType={revertType}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

type DeliveredOrderCardProps = {
  child: ChildOrderForDispatch;
  orgSlug: string;
  revertInfo: OrdersRevertInfoMap[string] | undefined;
  dispatchEvent?: OrderDispatchEventSummary;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (orderId: string) => void;
  downloadingRemito: string | null;
  generatingRemito: string | null;
};

function DispatchCardRemitoButtons({
  dispatchEvent,
  orderId,
  downloadingRemito,
  generatingRemito,
  onDownload,
  onGenerate,
  orgSlug,
}: {
  dispatchEvent: OrderDispatchEventSummary | undefined;
  orderId: string;
  downloadingRemito: string | null;
  generatingRemito: string | null;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (orderId: string) => void;
  orgSlug: string;
}) {
  if (dispatchEvent) {
    return (
      <>
        {dispatchEvent.remittance_pdf_url ? (
          <RemittancePreviewButton
            label="Ver Remito"
            pdfUrl={dispatchEvent.remittance_pdf_url}
          />
        ) : null}
        <Button
          disabled={
            downloadingRemito ===
            `${dispatchEvent.child_order_id}-${dispatchEvent.remito_number}`
          }
          onClick={(e) => {
            e.stopPropagation();
            onDownload(
              dispatchEvent.child_order_id,
              dispatchEvent.remito_number
            );
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {downloadingRemito ===
          `${dispatchEvent.child_order_id}-${dispatchEvent.remito_number}` ? (
            <Spinner className="size-4" />
          ) : (
            <FileTextIcon className="h-4 w-4" />
          )}
        </Button>
        <OrderRemittanceMaskPrintModal
          childOrderId={dispatchEvent.child_order_id}
          orgSlug={orgSlug}
          remitoNumber={dispatchEvent.remito_number}
        />
      </>
    );
  }

  return (
    <Button
      disabled={generatingRemito === orderId}
      onClick={(e) => {
        e.stopPropagation();
        onGenerate(orderId);
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {generatingRemito === orderId ? (
        <Spinner className="size-4" />
      ) : (
        <FileTextIcon className="h-4 w-4" />
      )}
      Generar Remito
    </Button>
  );
}

type DispatchedChildCardProps = {
  child: ChildOrderForDispatch;
  orgSlug: string;
  revertInfo: OrdersRevertInfoMap[string] | undefined;
  dispatchEvent?: OrderDispatchEventSummary;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (orderId: string) => void;
  downloadingRemito: string | null;
  generatingRemito: string | null;
};

function DispatchedChildCard({
  child,
  orgSlug,
  revertInfo,
  dispatchEvent,
  onDownload,
  onGenerate,
  downloadingRemito,
  generatingRemito,
}: DispatchedChildCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [revertOpen, setRevertOpen] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";

  function handleConfirmDelivery() {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: child.id,
        newStatus: "DELIVERED",
        notes: deliveryNotes,
      });

      if (result.success) {
        toast.success("Entrega confirmada al cliente");
        setDeliveryNotes("");
        router.refresh();
      } else {
        toast.error(`Error al confirmar entrega: ${result.error}`);
      }
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader
        className={cn(
          "flex cursor-pointer flex-row items-center gap-2 py-2.5",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ArrowElbowDownRightIcon className="size-4 shrink-0 text-muted-foreground" />
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${child.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {child.order_number}
        </Link>
        <OrderStatusBadge status={child.status} />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <DispatchCardRemitoButtons
            dispatchEvent={dispatchEvent}
            downloadingRemito={downloadingRemito}
            generatingRemito={generatingRemito}
            onDownload={onDownload}
            onGenerate={onGenerate}
            orderId={child.id}
            orgSlug={orgSlug}
          />
          {isExpanded ? (
            <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0 pb-3">
          {child.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pr-2 pb-1 text-left font-medium">
                      Producto
                    </th>
                    <th className="pb-1 pl-2 text-right font-medium">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {child.items.map((item) => (
                    <tr className="border-b last:border-0" key={item.id}>
                      <td className="py-1 pr-2">
                        {item.description}
                        <ItemExtrasList
                          extras={item.quote_item_extras}
                          showPrice={false}
                        />
                      </td>
                      <td className="py-1 pl-2 text-right tabular-nums">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label
              className="mb-1 block font-medium text-sm"
              htmlFor={`delivery-notes-${child.id}`}
            >
              Notas de entrega
            </label>
            <Textarea
              id={`delivery-notes-${child.id}`}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Notas sobre la entrega..."
              value={deliveryNotes}
            />
          </div>

          <div className="flex justify-end gap-2">
            {canRevert && (
              <Button
                className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
                disabled={isPending}
                onClick={() => setRevertOpen(true)}
                size="sm"
                variant="outline"
              >
                <ArrowFatLineLeftIcon className="size-4" />
                Volver atrás
              </Button>
            )}
            <Button
              disabled={isPending}
              onClick={handleConfirmDelivery}
              size="sm"
              variant="default"
            >
              <CheckCircleIcon className="mr-1 h-4 w-4" />
              {isPending ? "Confirmando..." : "Confirmar entrega al cliente"}
            </Button>
          </div>

          {canRevert && previousStatus && previousStatusLabel && (
            <RevertOrderModal
              onOpenChange={setRevertOpen}
              onSuccess={() => router.refresh()}
              open={revertOpen}
              orderId={child.id}
              orderNumber={child.order_number}
              orgSlug={orgSlug}
              previousStatus={previousStatus}
              previousStatusLabel={previousStatusLabel}
              revertType={revertType}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DeliveredChildCard({
  child,
  orgSlug,
  revertInfo,
  dispatchEvent,
  onDownload,
  onGenerate,
  downloadingRemito,
  generatingRemito,
}: DeliveredOrderCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";

  return (
    <Card className="border-dashed opacity-75">
      <CardHeader
        className={cn(
          "flex cursor-pointer flex-row items-center gap-2 py-2.5",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ArrowElbowDownRightIcon className="size-4 shrink-0 text-muted-foreground" />
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${child.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {child.order_number}
        </Link>
        <OrderStatusBadge status={child.status} />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <DispatchCardRemitoButtons
            dispatchEvent={dispatchEvent}
            downloadingRemito={downloadingRemito}
            generatingRemito={generatingRemito}
            onDownload={onDownload}
            onGenerate={onGenerate}
            orderId={child.id}
            orgSlug={orgSlug}
          />
          {isExpanded ? (
            <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3 pt-0 pb-3">
          {child.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pr-2 pb-1 text-left font-medium">
                      Producto
                    </th>
                    <th className="pb-1 pl-2 text-right font-medium">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {child.items.map((item) => (
                    <tr className="border-b last:border-0" key={item.id}>
                      <td className="py-1 pr-2">
                        {item.description}
                        <ItemExtrasList
                          extras={item.quote_item_extras}
                          showPrice={false}
                        />
                      </td>
                      <td className="py-1 pl-2 text-right tabular-nums">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canRevert && (
            <div className="flex justify-end">
              <Button
                className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
                onClick={() => setRevertOpen(true)}
                size="sm"
                variant="outline"
              >
                <ArrowFatLineLeftIcon className="size-4" />
                Volver atrás
              </Button>
            </div>
          )}
          {canRevert && previousStatus && previousStatusLabel && (
            <RevertOrderModal
              onOpenChange={setRevertOpen}
              onSuccess={() => router.refresh()}
              open={revertOpen}
              orderId={child.id}
              orderNumber={child.order_number}
              orgSlug={orgSlug}
              previousStatus={previousStatus}
              previousStatusLabel={previousStatusLabel}
              revertType={revertType}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

type DispatchSectionProps = {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
};

function DispatchSection({
  title,
  icon: Icon,
  count,
  children,
}: DispatchSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" weight="duotone" />
        <h2 className="font-heading font-semibold text-lg">{title}</h2>
        <span className="ml-auto inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 font-medium text-xs tabular-nums">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
