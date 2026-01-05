"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { registerPaymentAction } from "@/modules/collections/actions/register-payment.action";
import { updatePaymentAction } from "@/modules/collections/actions/update-payment.action";
import type { PaymentMethod } from "@/modules/collections/types";
import type { Database } from "@/types/supabase";

type RegisterPaymentDialogProps = {
  orgSlug: string;
  accountId: string;
  type: "receivable" | "payable";
  pendingBalance: number;
  totalAmount: number;
  counterpartyName: string;
  dueDate?: string | null;
  trigger?: React.ReactNode;
  existingPayment?: {
    id: string;
    amount: number;
    payment_method: Database["public"]["Enums"]["payment_method"];
    payment_date?: string | null;
    reference_number?: string | null;
    notes?: string | null;
  };
  onCompleted?: () => void;
};

const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_de_credito", label: "Tarjeta de crédito" },
  { value: "tarjeta_de_debito", label: "Tarjeta de débito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
];

const textareaClasses =
  "min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

export function RegisterPaymentDialog({
  orgSlug,
  accountId,
  type,
  pendingBalance,
  totalAmount,
  counterpartyName,
  dueDate,
  trigger,
  existingPayment,
  onCompleted,
}: RegisterPaymentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEditMode = Boolean(existingPayment);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [amount, setAmount] = useState<string>(pendingBalance.toString());
  const [paymentDate, setPaymentDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxAllowedAmount = useMemo(
    () => pendingBalance + (existingPayment?.amount ?? 0),
    [existingPayment?.amount, pendingBalance]
  );

  const normalizePaymentMethod = (
    value?: Database["public"]["Enums"]["payment_method"] | PaymentMethod | null
  ): PaymentMethod => {
    switch (value) {
      case "EFECTIVO":
      case "efectivo":
        return "efectivo";
      case "TRANSFERENCIA":
      case "transferencia":
        return "transferencia";
      case "CHEQUE":
      case "cheque":
        return "cheque";
      case "TARJETA_CREDITO":
      case "tarjeta_de_credito":
        return "tarjeta_de_credito";
      case "TARJETA_DEBITO":
      case "tarjeta_de_debito":
        return "tarjeta_de_debito";
      default:
        return "efectivo";
    }
  };

  const normalizeDate = (value?: string | null) => {
    if (!value) {
      return new Date().toISOString().split("T")[0];
    }
    return value.split("T")[0] ?? value;
  };

  const resetForm = () => {
    if (existingPayment) {
      setPaymentMethod(normalizePaymentMethod(existingPayment.payment_method));
      setAmount(
        existingPayment.amount?.toString() ?? pendingBalance.toString()
      );
      setPaymentDate(normalizeDate(existingPayment.payment_date));
      setReferenceNumber(existingPayment.reference_number ?? "");
      setNotes(existingPayment.notes ?? "");
    } else {
      setPaymentMethod("efectivo");
      setAmount(pendingBalance.toString());
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setReferenceNumber("");
      setNotes("");
    }
    setError(null);
  };

  useEffect(() => {
    if (isEditMode) {
      return;
    }
    setAmount(pendingBalance.toString());
  }, [isEditMode, pendingBalance]);

  const dueLabel = useMemo(() => {
    if (!dueDate) {
      return "Sin vencimiento";
    }
    return formatDateOnly(dueDate);
  }, [dueDate]);

  const handleSubmit = () => {
    setError(null);
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Ingresa un monto mayor a cero.");
      return;
    }

    if (parsedAmount > maxAllowedAmount) {
      setError("El monto excede el saldo pendiente.");
      return;
    }

    startTransition(async () => {
      const result = existingPayment
        ? await updatePaymentAction({
            orgSlug,
            accountId,
            paymentId: existingPayment.id,
            type,
            amount: parsedAmount,
            paymentMethod,
            paymentDate,
            referenceNumber,
            notes,
          })
        : await registerPaymentAction({
            orgSlug,
            accountId,
            type,
            amount: parsedAmount,
            paymentMethod,
            paymentDate,
            referenceNumber,
            notes,
          });

      if (!result.success) {
        setError(
          result.error ??
            (existingPayment
              ? "No se pudo actualizar el pago."
              : "No se pudo registrar el pago.")
        );
        return;
      }

      setOpen(false);
      if (!existingPayment) {
        setAmount(result.newPendingBalance.toString());
        setReferenceNumber("");
        setNotes("");
      }
      onCompleted?.();
      router.refresh();
    });
  };

  const disabled = !isEditMode && pendingBalance <= 0;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          resetForm();
          return;
        }
        setError(null);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={disabled} size="sm" variant="outline">
            Registrar pago
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar pago parcial</DialogTitle>
          <DialogDescription>
            Aplica un pago a la cuenta seleccionada. El saldo pendiente se
            actualizará automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{counterpartyName}</p>
              <p className="text-muted-foreground">
                Vence:{" "}
                <span className="font-medium text-foreground">{dueLabel}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Saldo pendiente</p>
              <p className="font-semibold">{formatCurrency(pendingBalance)}</p>
              <p className="text-muted-foreground text-xs">
                Total: {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="amount">Monto</Label>
            <Input
              id="amount"
              inputMode="decimal"
              min={0}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={amount}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="paymentMethod">Método de pago</Label>
              <Select
                onValueChange={(value: PaymentMethod) =>
                  setPaymentMethod(value)
                }
                value={paymentMethod}
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue placeholder="Selecciona un método" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paymentDate">Fecha</Label>
              <Input
                id="paymentDate"
                onChange={(event) => setPaymentDate(event.target.value)}
                type="date"
                value={paymentDate}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="referenceNumber">Referencia</Label>
            <Input
              id="referenceNumber"
              onChange={(event) => setReferenceNumber(event.target.value)}
              placeholder="N° de transferencia, cheque, etc."
              value={referenceNumber}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notas</Label>
            <textarea
              className={textareaClasses}
              id="notes"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Comentarios internos sobre este pago"
              value={notes}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex w-full justify-end gap-2">
            <Button
              disabled={isPending}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isPending} onClick={handleSubmit} type="button">
              {(() => {
                if (isPending) {
                  return "Guardando...";
                }
                if (isEditMode) {
                  return "Actualizar pago";
                }
                return "Registrar pago";
              })()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
