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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelSaleAction } from "@/modules/sales/actions/cancel-sale.action";
import { deliverSaleAction } from "@/modules/sales/actions/deliver-sale.action";
import { dispatchSaleAction } from "@/modules/sales/actions/dispatch-sale.action";
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
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [remittanceNumber, setRemittanceNumber] = useState(
    sale.remittance_number ?? ""
  );
  const [showDeliverDialog, setShowDeliverDialog] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);

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

  const openDispatchDialog = () => {
    setDispatchError(null);
    setShowDispatchDialog(true);
  };

  const handleDispatchSale = async () => {
    if (!remittanceNumber.trim()) {
      setDispatchError("Ingresa el número de remito para despachar.");
      return;
    }

    setDispatchError(null);
    setIsDispatching(true);

    try {
      const result = await dispatchSaleAction({
        orgSlug,
        saleId: sale.id,
        remittanceNumber: remittanceNumber.trim(),
      });

      if (!result.success) {
        setDispatchError(result.error ?? "No se pudo despachar la venta");
        return;
      }

      setShowDispatchDialog(false);
      router.refresh();
    } catch (error) {
      console.error("Error dispatching sale:", error);
      setDispatchError("No se pudo despachar la venta");
    } finally {
      setIsDispatching(false);
    }
  };

  const openDeliverDialog = () => {
    setDeliverError(null);
    setShowDeliverDialog(true);
  };

  const handleDeliverSale = async () => {
    setDeliverError(null);
    setIsDelivering(true);

    try {
      const result = await deliverSaleAction({
        orgSlug,
        saleId: sale.id,
      });

      if (!result.success) {
        setDeliverError(result.error ?? "No se pudo marcar como entregada");
        return;
      }

      setShowDeliverDialog(false);
      router.refresh();
    } catch (error) {
      console.error("Error delivering sale:", error);
      setDeliverError("No se pudo marcar como entregada");
    } finally {
      setIsDelivering(false);
    }
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

            {sale.status === "CONFIRMED" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={openDispatchDialog}>
                  Despachar
                </DropdownMenuItem>
              </>
            ) : null}

            {sale.status === "DISPATCH" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={openDeliverDialog}>
                  Marcar como entregada
                </DropdownMenuItem>
              </>
            ) : null}

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

      <Dialog onOpenChange={setShowDispatchDialog} open={showDispatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Despachar venta</DialogTitle>
            <DialogDescription>
              Ingresa el número de remito para marcar la venta como despachada.
            </DialogDescription>
          </DialogHeader>

          {dispatchError ? (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {dispatchError}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="dispatchRemittance">Número de remito</Label>
            <Input
              autoFocus
              id="dispatchRemittance"
              onChange={(event) =>
                setRemittanceNumber(event.target.value.slice(0, 100))
              }
              placeholder="Ej: 0001-00001234"
              value={remittanceNumber}
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowDispatchDialog(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDispatching}
              onClick={handleDispatchSale}
              type="button"
            >
              {isDispatching ? "Despachando..." : "Confirmar despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setShowDeliverDialog} open={showDeliverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como entregada</DialogTitle>
            <DialogDescription>
              Confirma que la venta fue entregada al cliente.
            </DialogDescription>
          </DialogHeader>

          {deliverError ? (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {deliverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => setShowDeliverDialog(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDelivering}
              onClick={handleDeliverSale}
              type="button"
            >
              {isDelivering ? "Marcando..." : "Confirmar entrega"}
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
