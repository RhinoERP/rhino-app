"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  usePosSalesAccountingInbox,
  usePosSalesAccountingInboxMutations,
} from "@/modules/pos/hooks/use-pos-accounting-inbox";
import type { PosSaleAccountingInboxItem } from "@/modules/pos/types";
import {
  type PosAccountingInboxAction,
  type PosAccountingInboxStatus,
  resolvePosAccountingInboxAction,
} from "@/modules/pos/utils/accounting-inbox";

type Props = {
  orgSlug: string;
};

type StatusFilter = PosAccountingInboxStatus | "all";

const STATUS_BADGE: Record<
  PosAccountingInboxStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  REVIEW_REQUIRED: { label: "Requiere revisión", variant: "default" },
  ERROR: { label: "Error", variant: "destructive" },
  FORMALIZATION_ERROR: {
    label: "Falló la formalización",
    variant: "destructive",
  },
  PENDING: { label: "Pendiente de formalizar", variant: "secondary" },
};

const ACTION_LABEL: Record<PosAccountingInboxAction, string> = {
  review: "Revisar asiento",
  formalize: "Formalizar",
  wait: "Esperando ARCA",
  unavailable: "Sin datos del asiento",
};

const INVOICE_LABEL: Record<string, string> = {
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  TICKET_X: "Ticket X",
};

function resolveRowAction(
  item: PosSaleAccountingInboxItem
): PosAccountingInboxAction {
  return resolvePosAccountingInboxAction({
    accountingStatus: item.accountingStatus as PosAccountingInboxStatus,
    arcaStatus: item.arcaStatus,
    hasEventSnapshot: Boolean(item.eventSnapshot),
  });
}

function isBatchRetryable(action: PosAccountingInboxAction): boolean {
  return action === "formalize";
}

export function PosSalesAccountingInbox({ orgSlug }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewItem, setReviewItem] =
    useState<PosSaleAccountingInboxItem | null>(null);

  const {
    data: items = [],
    isLoading,
    isError,
  } = usePosSalesAccountingInbox(
    orgSlug,
    statusFilter === "all" ? undefined : statusFilter
  );
  const { retry, confirm } = usePosSalesAccountingInboxMutations(orgSlug);

  const retryableIds = useMemo(
    () =>
      items
        .filter((item) => isBatchRetryable(resolveRowAction(item)))
        .map((item) => item.id),
    [items]
  );
  const selectedRetryableIds = retryableIds.filter((id) => selectedIds.has(id));
  const allSelected =
    retryableIds.length > 0 &&
    selectedRetryableIds.length === retryableIds.length;

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(retryableIds) : new Set());
  };

  const runRetry = async (posSaleIds: string[]) => {
    try {
      const results = await retry.mutateAsync(posSaleIds);
      const failed = results.filter((result) => !result.success);

      if (failed.length === 0) {
        toast.success(
          posSaleIds.length === 1
            ? "Asiento de la venta formalizado."
            : `Se formalizaron ${posSaleIds.length} ventas.`
        );
      } else {
        const firstError = failed[0];
        toast.error(
          `${failed.length} de ${posSaleIds.length} ventas no se pudieron formalizar${
            firstError && !firstError.success ? `: ${firstError.error}` : "."
          }`
        );
      }
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo formalizar el asiento."
      );
    }
  };

  const handleReviewConfirm = async (informalEntryId: string) => {
    if (!reviewItem) {
      return;
    }

    try {
      await confirm.mutateAsync({
        posSaleId: reviewItem.id,
        informalEntryId,
      });
      toast.success("Asiento de la venta POS confirmado.");
      setReviewItem(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar el asiento contable."
      );
    }
  };

  const handleRowAction = (
    item: PosSaleAccountingInboxItem,
    action: PosAccountingInboxAction
  ) => {
    if (action === "review") {
      setReviewItem(item);
      return;
    }

    if (isBatchRetryable(action)) {
      runRetry([item.id]);
    }
  };

  return (
    <div className="space-y-4">
      {reviewItem?.eventSnapshot ? (
        <AsientoModal
          eventoPayload={reviewItem.eventSnapshot}
          mode="gate"
          onCancel={() => setReviewItem(null)}
          onConfirm={handleReviewConfirm}
          open
          persistAs="informal"
          sourceType="VENTA_POS"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Estado</span>
          <Select
            onValueChange={(value) => {
              setStatusFilter(value as StatusFilter);
              setSelectedIds(new Set());
            }}
            value={statusFilter}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="REVIEW_REQUIRED">Requiere revisión</SelectItem>
              <SelectItem value="ERROR">Error</SelectItem>
              <SelectItem value="FORMALIZATION_ERROR">
                Falló la formalización
              </SelectItem>
              <SelectItem value="PENDING">Pendiente de formalizar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="ml-auto"
          disabled={selectedRetryableIds.length === 0 || retry.isPending}
          onClick={() => runRetry(selectedRetryableIds)}
          size="sm"
          type="button"
        >
          Formalizar seleccionadas ({selectedRetryableIds.length})
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando ventas...</p>
      ) : null}
      {isError ? (
        <p className="text-destructive text-sm">
          Error al cargar las ventas POS pendientes de contabilizar.
        </p>
      ) : null}

      {isLoading || isError ? null : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Seleccionar todas las ventas a formalizar"
                    checked={allSelected}
                    disabled={retryableIds.length === 0}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Medio de pago</TableHead>
                <TableHead>ARCA</TableHead>
                <TableHead>Estado contable</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground text-sm"
                    colSpan={9}
                  >
                    No hay ventas POS pendientes de contabilizar.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const action = resolveRowAction(item);
                  const badge =
                    STATUS_BADGE[
                      item.accountingStatus as PosAccountingInboxStatus
                    ];
                  const isRetryable = isBatchRetryable(action);

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Seleccionar venta ${item.receiptNumber ?? item.id}`}
                          checked={selectedIds.has(item.id)}
                          disabled={!isRetryable}
                          onCheckedChange={(checked) =>
                            toggleSelected(item.id, checked === true)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(item.saleDate, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link
                          className="underline-offset-4 hover:underline"
                          href={`/org/${orgSlug}/venta-directa/${item.id}`}
                        >
                          {item.invoiceNumber ?? item.receiptNumber ?? "—"}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {INVOICE_LABEL[item.invoiceType ?? ""] ??
                            item.invoiceType ??
                            "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(item.totalAmount)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.paymentMethod ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.arcaStatus ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground text-xs">
                        {item.accountingLastError ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={
                            action === "wait" ||
                            action === "unavailable" ||
                            retry.isPending ||
                            confirm.isPending
                          }
                          onClick={() => handleRowAction(item, action)}
                          size="sm"
                          type="button"
                          variant={action === "review" ? "default" : "outline"}
                        >
                          {ACTION_LABEL[action]}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
