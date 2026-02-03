"use client";

import { ClockClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import {
  type DeletePaymentInput,
  deletePaymentAction,
} from "@/modules/collections/actions/delete-payment.action";
import {
  getPaymentHistoryAction,
  type PaymentHistoryEntry,
} from "@/modules/collections/actions/get-payment-history.action";
import { RegisterPaymentDialog } from "./register-payment-dialog";

type PaymentHistoryDialogProps = {
  trigger?: React.ReactNode;
  counterpartyName: string;
  counterpartyId: string;
  dueDate?: string | null;
  pendingBalance?: number;
  orgSlug: string;
  orgId?: string;
  accountId: string;
  type: "receivable" | "payable";
  totalAmount: number;
};

export function PaymentHistoryDialog({
  trigger,
  counterpartyName,
  counterpartyId,
  dueDate,
  pendingBalance,
  orgSlug,
  orgId,
  accountId,
  type,
  totalAmount,
}: PaymentHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentHistoryEntry[] | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] =
    useState<PaymentHistoryEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const empty = useMemo(() => !payments || payments.length === 0, [payments]);
  const hasBlockingState = isPending || error || empty;
  const canShowList = !hasBlockingState;

  useEffect(() => {
    if (!open || payments) {
      return;
    }

    startTransition(async () => {
      const result = await getPaymentHistoryAction({
        orgSlug,
        orgId,
        accountId,
        type,
      });

      if (!result.success) {
        setError(result.error ?? "No se pudo obtener el historial");
        return;
      }

      setPayments(result.data ?? []);
    });
  }, [accountId, open, orgId, orgSlug, payments, type]);

  const reset = () => {
    setOpen(false);
    setError(null);
    setPayments(null);
  };

  const handleDeleteClick = (payment: PaymentHistoryEntry) => {
    setPaymentToDelete(payment);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!paymentToDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      const input: DeletePaymentInput = {
        orgSlug,
        paymentId: paymentToDelete.id,
        accountId,
        type,
      };

      const result = await deletePaymentAction(input);

      if (!result.success) {
        toast.error(result.error ?? "No se pudo eliminar el pago");
        return;
      }

      toast.success("Pago eliminado correctamente");
      setDeleteDialogOpen(false);
      setPaymentToDelete(null);
      setError(null);
      setPayments(null);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Error inesperado al eliminar el pago"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            Ver historial
          </Button>
        )}
      </DialogTrigger>
      <DialogContent onCloseAutoFocus={reset}>
        <DialogHeader>
          <DialogTitle>Historial de transacciones</DialogTitle>
          <DialogDescription>{counterpartyName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {dueDate ? (
            <p>
              Vence: <span className="font-medium">{dueDate}</span>
            </p>
          ) : null}
          {pendingBalance !== undefined ? (
            <p>
              Saldo pendiente:{" "}
              <span className="font-medium">{pendingBalance}</span>
            </p>
          ) : null}
        </div>
        <Separator />
        {isPending && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <ClockClockwiseIcon
              className="h-5 w-5 animate-spin"
              weight="duotone"
            />
            <p className="text-sm">Cargando historial...</p>
          </div>
        )}
        {!isPending && error && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-destructive">
            <p className="text-sm">No se pudo obtener el historial.</p>
            <p className="text-xs">{error}</p>
            <Button
              onClick={() => {
                setError(null);
                setPayments(null);
                setOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        )}
        {!(isPending || error) && empty && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <ClockClockwiseIcon className="h-5 w-5" weight="duotone" />
            <p className="text-sm">Sin pagos registrados aún.</p>
            <p className="text-xs">
              Los pagos aparecerán aquí cuando los registres.
            </p>
          </div>
        )}
        {canShowList && (
          <div className="space-y-3">
            {payments?.map((payment) => (
              <div
                className="rounded-md border p-3 text-sm leading-relaxed"
                key={payment.id}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">
                    {formatCurrency(payment.amount)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateOnly(payment.payment_date)}
                  </p>
                  <div className="flex items-center gap-2">
                    <RegisterPaymentDialog
                      accountId={accountId}
                      counterpartyId={counterpartyId}
                      counterpartyName={counterpartyName}
                      dueDate={dueDate}
                      existingPayment={payment}
                      onCompleted={() => {
                        setError(null);
                        setPayments(null);
                      }}
                      orgSlug={orgSlug}
                      pendingBalance={pendingBalance ?? 0}
                      totalAmount={totalAmount}
                      trigger={
                        <Button className="px-4" size="sm" variant="outline">
                          Editar
                        </Button>
                      }
                      type={type}
                    />
                    <Button
                      className="px-4"
                      onClick={() => handleDeleteClick(payment)}
                      size="sm"
                      variant="outline"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-1 text-muted-foreground text-xs">
                  <p>
                    Método:{" "}
                    <span className="font-medium">
                      {payment.payment_method}
                    </span>
                  </p>
                  {payment.reference_number ? (
                    <p>
                      Referencia:{" "}
                      <span className="font-medium">
                        {payment.reference_number}
                      </span>
                    </p>
                  ) : null}
                  {payment.notes ? <p>Notas: {payment.notes}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El pago de{" "}
              {paymentToDelete ? formatCurrency(paymentToDelete.amount) : ""}{" "}
              será eliminado y el saldo pendiente se actualizará
              automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
