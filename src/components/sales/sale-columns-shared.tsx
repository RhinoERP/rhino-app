"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cancelSaleAction } from "@/modules/sales/actions/cancel-sale.action";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type SaleActionsCellProps = {
  sale: SalesOrderWithCustomer;
  orgSlug: string;
};

export function SaleActionsCell({ sale, orgSlug }: SaleActionsCellProps) {
  const router = useRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelSale = async () => {
    setCancelError(null);
    setIsCanceling(true);

    try {
      const result = await cancelSaleAction(orgSlug, sale.id);

      if (!result.success) {
        setCancelError(result.error ?? "No se pudo cancelar la venta");
        return;
      }

      setShowCancelDialog(false);
      router.refresh();
    } catch (error) {
      console.error("Error cancelling sale:", error);
      setCancelError("No se pudo cancelar la venta");
    } finally {
      setIsCanceling(false);
    }
  };

  const openCancelDialog = () => {
    setCancelError(null);
    setShowCancelDialog(true);
  };

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 w-8 p-0" variant="ghost">
              <span className="sr-only">Abrir menú</span>
              <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Link
                className="flex w-full items-center"
                href={`/org/${orgSlug}/ventas/${sale.id}`}
              >
                Ver detalles
              </Link>
            </DropdownMenuItem>

            {sale.status !== "CANCELLED" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={openCancelDialog}
                >
                  Cancelar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog onOpenChange={setShowCancelDialog} open={showCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar venta</DialogTitle>
            <DialogDescription>
              ¿Quieres cancelar esta venta? Se moverá al estado{" "}
              <strong>Cancelada</strong> y no podrás deshacer esta acción.
            </DialogDescription>
          </DialogHeader>

          {cancelError && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {cancelError}
            </div>
          )}

          <DialogFooter>
            <Button
              disabled={isCanceling}
              onClick={() => setShowCancelDialog(false)}
              type="button"
              variant="outline"
            >
              Mantener venta
            </Button>
            <Button
              disabled={isCanceling}
              onClick={handleCancelSale}
              type="button"
              variant="destructive"
            >
              {isCanceling ? "Cancelando..." : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function createSalesActionsColumn(
  orgSlug: string
): ColumnDef<SalesOrderWithCustomer> {
  return {
    header: () => <SlidersHorizontalIcon className="mr-2 ml-auto size-4" />,
    id: "actions",
    enableHiding: false,
    enableColumnFilter: false,
    enableSorting: false,
    size: 10,
    enableResizing: true,
    cell: ({ row }) => (
      <SaleActionsCell orgSlug={orgSlug} sale={row.original} />
    ),
  };
}
