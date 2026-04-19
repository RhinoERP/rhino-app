"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import { useRemittanceSettings } from "@/modules/organizations/hooks/use-remittance-settings";
import { cancelSaleAction } from "@/modules/sales/actions/cancel-sale.action";
import { deliverSaleAction } from "@/modules/sales/actions/deliver-sale.action";
import { dispatchSaleAction } from "@/modules/sales/actions/dispatch-sale.action";
import { useDeletePreSale } from "@/modules/sales/hooks/use-delete-pre-sale";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type SaleActionsCellProps = {
  sale: SalesOrderWithCustomer;
  orgSlug: string;
};

type StatusActionMenuItemsProps = {
  status: SalesOrderWithCustomer["status"];
  onDispatch: () => void;
  onDeliver: () => void;
};

function StatusActionMenuItems({
  status,
  onDispatch,
  onDeliver,
}: StatusActionMenuItemsProps) {
  if (status === "CONFIRMED") {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDispatch}>Despachar</DropdownMenuItem>
      </>
    );
  }

  if (status === "DISPATCH") {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDeliver}>
          Marcar como entregada
        </DropdownMenuItem>
      </>
    );
  }

  return null;
}

type ReturnProductsMenuItemProps = {
  canReturnProducts: boolean;
  href: string;
};

function ReturnProductsMenuItem({
  canReturnProducts,
  href,
}: ReturnProductsMenuItemProps) {
  if (!canReturnProducts) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <Link className="flex w-full items-center" href={href} prefetch={false}>
          Devolver productos
        </Link>
      </DropdownMenuItem>
    </>
  );
}

type CancelSaleMenuItemProps = {
  isCancelled: boolean;
  onCancel: () => void;
};

function CancelSaleMenuItem({
  isCancelled,
  onCancel,
}: CancelSaleMenuItemProps) {
  if (isCancelled) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={onCancel}
      >
        Cancelar
      </DropdownMenuItem>
    </>
  );
}

type DeleteSaleMenuItemProps = {
  canShowDeleteAction: boolean;
  onDelete: () => void;
};

function DeleteSaleMenuItem({
  canShowDeleteAction,
  onDelete,
}: DeleteSaleMenuItemProps) {
  if (!canShowDeleteAction) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={onDelete}
      >
        Eliminar venta
      </DropdownMenuItem>
    </>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: action menu combines status transitions with permission-aware UI states
export function SaleActionsCell({ sale, orgSlug }: SaleActionsCellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deletePreSaleMutation = useDeletePreSale(orgSlug);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [remittanceNumber, setRemittanceNumber] = useState(
    sale.remittance_number ?? ""
  );
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(
    sale.customer?.preferred_carrier_id ?? null
  );
  const { data: carriers = [] } = useCarriers(orgSlug);
  const { data: orgSettings } = useOrgSettings(orgSlug);
  const requireCarrier = orgSettings?.require_carrier_on_dispatch ?? false;
  const [isGeneratingRemittance, setIsGeneratingRemittance] = useState(false);
  const remittanceSettings = useRemittanceSettings(orgSlug);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only fires on dialog open
  useEffect(() => {
    if (!showDispatchDialog) {
      return;
    }
    if (!remittanceSettings?.autoEnabled) {
      return;
    }
    if (remittanceNumber) {
      return;
    }

    setIsGeneratingRemittance(true);
    generateRemittanceNumber(orgSlug).then((result) => {
      if (result.success && result.number) {
        setRemittanceNumber(result.number);
      }
      setIsGeneratingRemittance(false);
    });
  }, [showDispatchDialog]);
  const [showDeliverDialog, setShowDeliverDialog] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const rawSaleStatus = String(sale.status);
  const canManageSale = sale.access?.canManage ?? false;
  const canReturnProducts =
    canManageSale &&
    (sale.status === "DISPATCH" || sale.status === "DELIVERED");
  const isCancelledSale = rawSaleStatus === "CANCELLED";
  const canDeletePreSale =
    canManageSale && (rawSaleStatus === "DRAFT" || rawSaleStatus === "PENDING");
  const canShowDeleteAction =
    canManageSale && (canDeletePreSale || isCancelledSale);

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
      queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      queryClient.invalidateQueries({ queryKey: ["sale-order", orgSlug] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
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

  const handleDeletePreSale = () => {
    deletePreSaleMutation.mutate(sale.id, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        router.refresh();
      },
    });
  };

  const openDispatchDialog = () => {
    setDispatchError(null);
    setShowDispatchDialog(true);
  };

  const handleDispatchSale = async () => {
    if (!(remittanceNumber.trim() || remittanceSettings?.autoEnabled)) {
      setDispatchError("Ingresa el número de remito para despachar.");
      return;
    }

    if (requireCarrier && !selectedCarrierId) {
      setDispatchError("Seleccioná un transporte para despachar.");
      return;
    }

    setDispatchError(null);
    setIsDispatching(true);

    try {
      const result = await dispatchSaleAction({
        orgSlug,
        saleId: sale.id,
        remittanceNumber: remittanceNumber.trim(),
        carrierId: selectedCarrierId,
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

  let dispatchPlaceholder = "Ej: 0001-00001234";
  if (remittanceSettings?.autoEnabled) {
    dispatchPlaceholder = "Generado automáticamente";
  }
  if (isGeneratingRemittance) {
    dispatchPlaceholder = "Generando...";
  }

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
                prefetch={false}
              >
                Ver detalles
              </Link>
            </DropdownMenuItem>

            {canManageSale ? (
              <StatusActionMenuItems
                onDeliver={openDeliverDialog}
                onDispatch={openDispatchDialog}
                status={sale.status}
              />
            ) : null}
            <ReturnProductsMenuItem
              canReturnProducts={canReturnProducts}
              href={`/org/${orgSlug}/ventas/${sale.id}?modo=devolucion`}
            />
            {canManageSale ? (
              <CancelSaleMenuItem
                isCancelled={sale.status === "CANCELLED"}
                onCancel={openCancelDialog}
              />
            ) : null}
            {canManageSale ? (
              <DeleteSaleMenuItem
                canShowDeleteAction={canShowDeleteAction}
                onDelete={() => setShowDeleteDialog(true)}
              />
            ) : null}
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

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar preventa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la preventa y sus ítems asociados de forma
              permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePreSaleMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePreSaleMutation.isPending}
              onClick={handleDeletePreSale}
            >
              {deletePreSaleMutation.isPending
                ? "Eliminando..."
                : "Eliminar preventa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setShowDispatchDialog} open={showDispatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Despachar venta</DialogTitle>
            <DialogDescription>
              {remittanceSettings?.autoEnabled
                ? "El número de remito se genera automáticamente."
                : "Ingresa el número de remito para marcar la venta como despachada."}
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
              autoFocus={!remittanceSettings?.autoEnabled}
              disabled={isGeneratingRemittance}
              id="dispatchRemittance"
              onChange={(event) =>
                setRemittanceNumber(event.target.value.slice(0, 100))
              }
              placeholder={dispatchPlaceholder}
              value={remittanceNumber}
            />
            {remittanceSettings?.autoEnabled && (
              <p className="text-muted-foreground text-xs">
                Podés editar el número antes de confirmar.
              </p>
            )}
          </div>

          {carriers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="dispatchCarrier">
                Transporte{requireCarrier ? "" : " (opcional)"}
              </Label>
              <Select
                onValueChange={(v) =>
                  setSelectedCarrierId(v === "none" ? null : v)
                }
                value={selectedCarrierId ?? "none"}
              >
                <SelectTrigger id="dispatchCarrier">
                  <SelectValue placeholder="Seleccionar transporte..." />
                </SelectTrigger>
                <SelectContent>
                  {!requireCarrier && (
                    <SelectItem value="none">Sin transporte</SelectItem>
                  )}
                  {carriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setShowDispatchDialog(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDispatching || isGeneratingRemittance}
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
