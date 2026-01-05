"use client";

import { ClockClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  getPaymentHistoryAction,
  type PaymentHistoryEntry,
} from "@/modules/collections/actions/get-payment-history.action";
import { RegisterPaymentDialog } from "./register-payment-dialog";

type PaymentHistoryDialogProps = {
  trigger?: React.ReactNode;
  counterpartyName: string;
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
                  <RegisterPaymentDialog
                    accountId={accountId}
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
    </Dialog>
  );
}
