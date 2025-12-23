"use client";

import { CheckCircleIcon, TruckIcon, XCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import { PurchaseInTransitDialog } from "./purchase-in-transit-dialog";

type PurchaseOrderDetailsProps = {
  purchaseOrder: PurchaseOrder & {
    items: (PurchaseOrderItem & {
      product_name?: string;
      weight_per_unit?: number | null;
      unit_of_measure?: string;
      total_weight_kg?: number | null;
    })[];
  };
  orgSlug: string;
};

const statusConfig: Record<
  PurchaseOrder["status"],
  { label: string; color: string; icon: typeof CheckCircleIcon }
> = {
  ORDERED: {
    label: "Ordenada",
    color: "bg-blue-500",
    icon: CheckCircleIcon,
  },
  IN_TRANSIT: {
    label: "En tránsito",
    color: "bg-orange-500",
    icon: TruckIcon,
  },
  RECEIVED: {
    label: "Recibida",
    color: "bg-green-500",
    icon: CheckCircleIcon,
  },
  CANCELLED: {
    label: "Cancelada",
    color: "bg-red-500",
    icon: XCircleIcon,
  },
};

export function PurchaseOrderDetails({
  purchaseOrder,
  orgSlug,
}: PurchaseOrderDetailsProps) {
  const router = useRouter();
  const updateStatus = useUpdatePurchaseStatus(orgSlug);
  const [isUpdating, setIsUpdating] = useState(false);
  const [inTransitDialogOpen, setInTransitDialogOpen] = useState(false);

  const statusInfo = statusConfig[purchaseOrder.status];
  const StatusIcon = statusInfo.icon;

  const handleStatusChange = async (
    newStatus: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
  ) => {
    if (isUpdating) {
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updateStatus.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        status: newStatus,
      });

      if (result.success) {
        router.refresh();

        if (newStatus === "RECEIVED") {
          router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}/recibir`);
        } else {
          router.refresh();
        }
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const canMoveToInTransit = purchaseOrder.status === "ORDERED";
  const canMoveToReceived = purchaseOrder.status === "IN_TRANSIT";

  return (
    <div className="space-y-6">
      {/* Estado y acciones */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Estado de la Compra</CardTitle>
            <Badge className={statusInfo.color} variant="default">
              <StatusIcon className="mr-1 h-3 w-3" />
              {statusInfo.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {canMoveToInTransit && (
              <Button
                disabled={isUpdating}
                onClick={() => {
                  setInTransitDialogOpen(true);
                }}
                variant="default"
              >
                <TruckIcon className="mr-2 h-4 w-4" />
                Marcar como En Tránsito
              </Button>
            )}
            {canMoveToReceived && (
              <Button
                disabled={isUpdating}
                onClick={() => handleStatusChange("RECEIVED")}
                variant="default"
              >
                <CheckCircleIcon className="mr-2 h-4 w-4" />
                Marcar como Recibida
              </Button>
            )}
            {purchaseOrder.status !== "CANCELLED" &&
              purchaseOrder.status !== "RECEIVED" && (
                <Button
                  disabled={isUpdating}
                  onClick={() => handleStatusChange("CANCELLED")}
                  variant="destructive"
                >
                  <XCircleIcon className="mr-2 h-4 w-4" />
                  Cancelar Compra
                </Button>
              )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-sm">Fecha de compra</p>
              <p className="font-medium">
                {formatDateOnly(purchaseOrder.purchase_date)}
              </p>
            </div>
            {purchaseOrder.payment_due_date && (
              <div>
                <p className="text-muted-foreground text-sm">
                  Fecha de vencimiento
                </p>
                <p className="font-medium">
                  {formatDateOnly(purchaseOrder.payment_due_date)}
                </p>
              </div>
            )}
            {purchaseOrder.remittance_number && (
              <div>
                <p className="text-muted-foreground text-sm">
                  Número de remito
                </p>
                <p className="font-medium">{purchaseOrder.remittance_number}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-sm">Total</p>
              <p className="font-semibold text-lg">
                {formatCurrency(purchaseOrder.total_amount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Productos */}
      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Kg</TableHead>
                <TableHead>Precio Unitario</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrder.items.map((item) => {
                const itemWithName = item as PurchaseOrderItem & {
                  product_name?: string;
                };
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {itemWithName.product_name || item.product_id}
                    </TableCell>
                    <TableCell>{item.unit_quantity ?? "-"}</TableCell>
                    <TableCell>
                      {item.quantity
                        ? `${item.quantity.toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} kg`
                        : "-"}
                    </TableCell>
                    <TableCell>{formatCurrency(item.unit_cost ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.subtotal ?? 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canMoveToInTransit && (
        <PurchaseInTransitDialog
          onOpenChange={setInTransitDialogOpen}
          open={inTransitDialogOpen}
          orgSlug={orgSlug}
          purchaseOrderId={purchaseOrder.id}
        />
      )}
    </div>
  );
}
