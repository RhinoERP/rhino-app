"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import { useCustomerMutations } from "@/modules/customers/hooks/use-customers-mutations";
import type { CustomerActiveItems } from "@/modules/customers/service/customers.service";
import type { Customer } from "@/modules/customers/types";

type ArchiveCustomerDialogProps = {
  customer: Customer;
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats?: {
    totalSales: number;
    totalAmount: number;
    pendingAmount?: number;
  };
};

function useFetchActiveItems(
  open: boolean,
  isCurrentlyActive: boolean,
  orgSlug: string,
  customerId: string
) {
  const [activeItems, setActiveItems] = useState<CustomerActiveItems | null>(
    null
  );
  const [isLoadingActiveItems, setIsLoadingActiveItems] = useState(false);

  useEffect(() => {
    if (!(open && isCurrentlyActive)) {
      setActiveItems(null);
      return;
    }

    const fetchActiveItems = async () => {
      setIsLoadingActiveItems(true);
      try {
        const response = await fetch(
          `/api/org/${orgSlug}/customers/${customerId}/active-items`
        );
        if (!response.ok) {
          throw new Error("No se pudieron cargar los datos del cliente");
        }
        const data = await response.json();
        setActiveItems(data);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Error al verificar el estado del cliente"
        );
      } finally {
        setIsLoadingActiveItems(false);
      }
    };

    fetchActiveItems();
  }, [open, isCurrentlyActive, orgSlug, customerId]);

  return { activeItems, isLoadingActiveItems };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI component with necessary conditional rendering
export function ArchiveCustomerDialog({
  customer,
  orgSlug,
  open,
  onOpenChange,
  stats,
}: ArchiveCustomerDialogProps) {
  const router = useRouter();
  const { updateCustomer } = useCustomerMutations(orgSlug);
  const [isArchiving, setIsArchiving] = useState(false);

  const displayName = customer.fantasy_name || customer.business_name;
  const isCurrentlyActive = customer.is_active ?? true; // Default to true if null

  const { activeItems, isLoadingActiveItems } = useFetchActiveItems(
    open,
    isCurrentlyActive,
    orgSlug,
    customer.id
  );

  const hasActiveItems: boolean = Boolean(
    activeItems &&
      (activeItems.activeSales.length > 0 ||
        activeItems.pendingCollections.length > 0)
  );

  const canArchive: boolean = !(hasActiveItems || isLoadingActiveItems);

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await updateCustomer.mutateAsync({
        customerId: customer.id,
        is_active: !isCurrentlyActive,
      });

      toast.success(
        isCurrentlyActive
          ? "Cliente desactivado correctamente"
          : "Cliente activado correctamente"
      );
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      let errorMessage = "Error desconocido";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (isCurrentlyActive) {
        errorMessage = "No se pudo desactivar el cliente";
      } else {
        errorMessage = "No se pudo activar el cliente";
      }
      toast.error(errorMessage);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isCurrentlyActive ? "¿Desactivar cliente?" : "¿Activar cliente?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                {isCurrentlyActive
                  ? "Estás a punto de desactivar a"
                  : "Estás a punto de activar a"}{" "}
                <strong>{displayName}</strong>.
              </p>

              {/* Customer Information */}
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-foreground">
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    Razón Social
                  </p>
                  <p className="font-medium text-sm">
                    {customer.business_name}
                  </p>
                  {customer.fantasy_name && (
                    <p className="text-muted-foreground text-xs">
                      {customer.fantasy_name}
                    </p>
                  )}
                </div>

                {customer.cuit && (
                  <div>
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                      CUIT
                    </p>
                    <p className="font-mono text-sm">{customer.cuit}</p>
                  </div>
                )}

                <Separator />

                {/* Active Items Warning (only when archiving) */}
                {isCurrentlyActive && isLoadingActiveItems && (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      Verificando estado del cliente...
                    </p>
                  </div>
                )}

                {isCurrentlyActive &&
                  !isLoadingActiveItems &&
                  hasActiveItems &&
                  activeItems && (
                    <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                        <div className="space-y-2">
                          <p className="font-semibold text-destructive text-sm">
                            No se puede desactivar este cliente
                          </p>
                          <p className="text-sm">
                            Este cliente tiene operaciones activas que deben
                            completarse o cancelarse antes de desactivarlo:
                          </p>
                          <ul className="ml-4 list-disc space-y-1 text-sm">
                            {activeItems.activeSales.length > 0 && (
                              <li>
                                <strong>
                                  {activeItems.activeSales.length}
                                </strong>{" "}
                                venta
                                {activeItems.activeSales.length !== 1
                                  ? "s"
                                  : ""}{" "}
                                activa
                                {activeItems.activeSales.length !== 1
                                  ? "s"
                                  : ""}
                              </li>
                            )}
                            {activeItems.pendingCollections.length > 0 && (
                              <li>
                                <strong>
                                  {activeItems.pendingCollections.length}
                                </strong>{" "}
                                cobranza
                                {activeItems.pendingCollections.length !== 1
                                  ? "s"
                                  : ""}{" "}
                                pendiente
                                {activeItems.pendingCollections.length !== 1
                                  ? "s"
                                  : ""}
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Stats Section */}
                {stats && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        Actividad
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Ventas totales
                          </p>
                          <p className="font-semibold text-lg">
                            {stats.totalSales}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Monto total
                          </p>
                          <p className="font-semibold text-lg">
                            {formatCurrency(stats.totalAmount)}
                          </p>
                        </div>
                      </div>

                      {stats.pendingAmount !== undefined &&
                        stats.pendingAmount > 0 && (
                          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                            <p className="text-amber-900 text-xs dark:text-amber-200">
                              <strong>Saldo pendiente:</strong>{" "}
                              {formatCurrency(stats.pendingAmount)}
                            </p>
                          </div>
                        )}
                    </div>
                  </>
                )}

                <Separator />

                {/* Current Status */}
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    Estado actual
                  </p>
                  <div className="mt-1">
                    <Badge
                      variant={isCurrentlyActive ? "default" : "secondary"}
                    >
                      {isCurrentlyActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </div>
              </div>

              <p className="text-sm">
                {isCurrentlyActive ? (
                  <>
                    Al desactivar este cliente, permanecerá en el sistema pero
                    se marcará como inactivo. Podrás reactivarlo en cualquier
                    momento.
                  </>
                ) : (
                  <>
                    Al activar este cliente, podrás volver a realizar
                    operaciones con él normalmente.
                  </>
                )}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isArchiving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={
              isCurrentlyActive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
            disabled={
              isArchiving ||
              isLoadingActiveItems ||
              (isCurrentlyActive && !canArchive)
            }
            onClick={(e) => {
              e.preventDefault();
              handleArchive();
            }}
          >
            {isArchiving && (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Procesando...
              </>
            )}
            {!isArchiving && isCurrentlyActive && "Desactivar"}
            {!(isArchiving || isCurrentlyActive) && "Activar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
