"use client";

import { CheckCircleIcon, TruckIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import { PurchaseInTransitDialog } from "../dialogs/purchase-in-transit-dialog";

type PurchaseActionsCellProps = {
  purchase: PurchaseOrderWithSupplier;
  orgSlug: string;
};

export function PurchaseActionsCell({
  purchase,
  orgSlug,
}: PurchaseActionsCellProps) {
  const router = useRouter();
  const [inTransitDialogOpen, setInTransitDialogOpen] = useState(false);

  const canMoveToInTransit = purchase.status === "ORDERED";
  const canMoveToReceived = purchase.status === "IN_TRANSIT";
  const canCancel =
    purchase.status !== "CANCELLED" && purchase.status !== "RECEIVED";

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {canMoveToInTransit && (
          <Button
            className="h-8"
            onClick={() => {
              setInTransitDialogOpen(true);
            }}
            size="sm"
            variant="outline"
          >
            <TruckIcon className="mr-1 h-4 w-4" />
            En Tránsito
          </Button>
        )}

        {canMoveToReceived && (
          <Button
            className="h-8"
            onClick={() => {
              router.push(`/org/${orgSlug}/compras/${purchase.id}/recibir`);
            }}
            size="sm"
            variant="outline"
          >
            <CheckCircleIcon className="mr-1 h-4 w-4" />
            Recibir
          </Button>
        )}

        {canCancel && (
          <Button
            className="h-8 text-destructive hover:text-destructive"
            onClick={() => {
              router.push(`/org/${orgSlug}/compras/${purchase.id}`);
            }}
            size="sm"
            variant="ghost"
          >
            <XCircleIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {canMoveToInTransit && (
        <PurchaseInTransitDialog
          onOpenChange={setInTransitDialogOpen}
          open={inTransitDialogOpen}
          orgSlug={orgSlug}
          purchaseOrderId={purchase.id}
        />
      )}
    </>
  );
}

export function createActionsColumn(
  orgSlug: string
): ColumnDef<PurchaseOrderWithSupplier> {
  return {
    header: () => <div className="mr-2 text-right">Acciones</div>,
    id: "actions",
    enableHiding: false,
    enableColumnFilter: false,
    enableSorting: false,
    size: 200,
    enableResizing: true,
    cell: ({ row }) => (
      <PurchaseActionsCell orgSlug={orgSlug} purchase={row.original} />
    ),
  };
}
