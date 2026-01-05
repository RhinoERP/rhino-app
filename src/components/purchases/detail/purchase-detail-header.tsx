"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { ArrowLeft, Lock, Pencil, XCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PurchaseOrder } from "@/modules/purchases/service/purchases.service";
import { PurchaseInTransitDialog } from "../dialogs/purchase-in-transit-dialog";

const statusLabels: Record<
  PurchaseOrder["status"],
  {
    label: string;
    icon: typeof ClipboardTextIcon;
    iconColor: string;
  }
> = {
  ORDERED: {
    label: "Ordenada",
    icon: ClipboardTextIcon,
    iconColor: "text-blue-500",
  },
  IN_TRANSIT: {
    label: "En tránsito",
    icon: TruckIcon,
    iconColor: "text-orange-500",
  },
  RECEIVED: {
    label: "Recibida",
    icon: CheckCircleIcon,
    iconColor: "text-green-500",
  },
  CANCELLED: {
    label: "Cancelada",
    icon: XCircleIcon,
    iconColor: "text-red-500",
  },
};

export function PurchaseStatusBadge({
  purchaseOrder,
}: {
  purchaseOrder: PurchaseOrder;
}) {
  const statusInfo = statusLabels[purchaseOrder.status];
  const StatusIcon = statusInfo.icon;

  return (
    <Badge className="gap-1.5 rounded-full" variant="outline">
      <StatusIcon
        className={`h-3.5 w-3.5 ${statusInfo.iconColor}`}
        weight="duotone"
      />
      {statusInfo.label}
    </Badge>
  );
}

type PurchaseDetailHeaderProps = {
  orgSlug: string;
  purchaseOrder: PurchaseOrder;
  isEditingDetails: boolean;
  isUpdatingStatus: boolean;
  onEditToggle: () => void;
  onStatusChange: (
    status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
  ) => void;
  onInTransitDialogOpen: () => void;
  isInTransitDialogOpen: boolean;
  onInTransitDialogChange: (open: boolean) => void;
};

export function PurchaseDetailHeader({
  orgSlug,
  purchaseOrder,
  isEditingDetails,
  isUpdatingStatus,
  onEditToggle,
  onStatusChange,
  onInTransitDialogOpen,
  isInTransitDialogOpen,
  onInTransitDialogChange,
}: PurchaseDetailHeaderProps) {
  const statusInfo = statusLabels[purchaseOrder.status];
  const _StatusIcon = statusInfo.icon;
  const isOrdered = purchaseOrder.status === "ORDERED";
  const isInTransit = purchaseOrder.status === "IN_TRANSIT";
  const isReceived = purchaseOrder.status === "RECEIVED";
  const isCancelled = purchaseOrder.status === "CANCELLED";

  const canEdit = isOrdered && !isCancelled;
  const canMoveToInTransit = isOrdered;
  const canMoveToReceived = isInTransit;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/org/${orgSlug}/compras`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a compras
          </Button>
        </Link>

        <div className="ml-auto flex gap-2">
          {canMoveToReceived && (
            <Button
              disabled={isUpdatingStatus}
              onClick={() => onStatusChange("RECEIVED")}
              size="sm"
              type="button"
            >
              <CheckCircleIcon className="mr-2 h-4 w-4" weight="duotone" />
              {isUpdatingStatus ? "Marcando..." : "Marcar como recibida"}
            </Button>
          )}
          {canMoveToInTransit && (
            <Button
              disabled={isUpdatingStatus}
              onClick={onInTransitDialogOpen}
              size="sm"
              type="button"
            >
              <TruckIcon className="mr-2 h-4 w-4" weight="duotone" />
              {isUpdatingStatus ? "Marcando..." : "Marcar como en tránsito"}
            </Button>
          )}
          {!(isCancelled || isReceived) && (
            <Button
              disabled={isUpdatingStatus}
              onClick={() => onStatusChange("CANCELLED")}
              size="sm"
              type="button"
              variant="destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          )}
          {canEdit && (
            <Button
              onClick={onEditToggle}
              size="sm"
              type="button"
              variant={isEditingDetails ? "secondary" : "outline"}
            >
              {isEditingDetails ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Bloquear campos
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar compra
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {canMoveToInTransit && (
        <PurchaseInTransitDialog
          onOpenChange={onInTransitDialogChange}
          open={isInTransitDialogOpen}
          orgSlug={orgSlug}
          purchaseOrderId={purchaseOrder.id}
        />
      )}
    </>
  );
}
