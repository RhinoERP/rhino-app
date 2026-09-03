"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type {
  RouteSheetStatus,
  RouteSheetWithSales,
} from "@/modules/route-sheets/types";

const STATUS_META: Record<
  RouteSheetStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  PENDING: { label: "Pendiente", variant: "secondary" },
  IN_PROGRESS: { label: "En progreso", variant: "default" },
  COMPLETED: { label: "Completada", variant: "outline" },
};

const STATUS_ACTION: Partial<Record<RouteSheetStatus, RouteSheetStatus>> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "IN_PROGRESS",
};

const STATUS_ACTION_LABEL: Partial<Record<RouteSheetStatus, string>> = {
  PENDING: "Comenzar",
  IN_PROGRESS: "Completar",
  COMPLETED: "Reabrir",
};

type RouteSheetHeaderProps = {
  canManage: boolean;
  canRead: boolean;
  routeSheet: RouteSheetWithSales;
  expanded: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  isDownloading: boolean;
  onToggleExpand: () => void;
  onUpdateStatus: (status: RouteSheetStatus) => void;
  onDelete: () => void;
  onDownload: () => void;
};

export function RouteSheetHeader({
  canManage,
  canRead,
  routeSheet,
  expanded,
  isUpdatingStatus,
  isDeleting,
  isDownloading,
  onToggleExpand,
  onUpdateStatus,
  onDelete,
  onDownload,
}: RouteSheetHeaderProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const totalAmount = truncateMoney(
    routeSheet.sales.reduce(
      (sum, sale) => sum + Number(sale.total_amount ?? 0),
      0
    )
  );
  const saleCount = routeSheet.sales.length;
  const statusMeta = STATUS_META[routeSheet.status];

  const nextStatus = STATUS_ACTION[routeSheet.status] ?? null;
  const statusActionLabel = STATUS_ACTION_LABEL[routeSheet.status] ?? "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          aria-label={expanded ? "Contraer" : "Expandir"}
          onClick={onToggleExpand}
          size="icon"
          variant="ghost"
        >
          {expanded ? (
            <CaretDownIcon className="h-4 w-4" />
          ) : (
            <CaretRightIcon className="h-4 w-4" />
          )}
        </Button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {routeSheet.carrier?.name ?? "Sin transporte"}
            </span>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {formatDateOnly(routeSheet.scheduled_date)}
            {routeSheet.notes ? ` — ${routeSheet.notes}` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right">
          <p className="font-medium text-sm tabular-nums">
            {formatCurrency(totalAmount)}
          </p>
          <p className="text-muted-foreground text-xs">
            {saleCount} venta{saleCount !== 1 ? "s" : ""}
          </p>
        </div>

        {canManage && nextStatus ? (
          <Button
            disabled={isUpdatingStatus}
            onClick={() => onUpdateStatus(nextStatus)}
            size="sm"
            variant="outline"
          >
            {isUpdatingStatus ? "Actualizando..." : statusActionLabel}
          </Button>
        ) : null}

        {canRead && routeSheet.sales.length > 0 && (
          <Button
            disabled={isDownloading}
            onClick={onDownload}
            size="sm"
            variant="outline"
          >
            <DownloadSimpleIcon className="mr-1 h-4 w-4" weight="bold" />
            {isDownloading ? "Descargando..." : "Descargar"}
          </Button>
        )}

        {canManage && routeSheet.status === "PENDING" && (
          <Button
            aria-label="Eliminar hoja de ruta"
            disabled={isDeleting}
            onClick={() => setDeleteOpen(true)}
            size="icon"
            variant="ghost"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar hoja de ruta?</AlertDialogTitle>
            <AlertDialogDescription>
              Las ventas quedarán despachadas pero se desvincularán de esta hoja
              de ruta. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={onDelete}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
