"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  counterpartyId: string;
  dueDate?: string | null;
  trigger?: React.ReactNode;
  existingPayment?: {
    id: string;
    amount: number;
    payment_method: Database["public"]["Enums"]["payment_method_type"];
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
  { value: "deposito", label: "Depósito" },
  { value: "e-cheq", label: "E-Cheq" },
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
  counterpartyId,
  dueDate,
  trigger,
  existingPayment,
  onCompleted,
}: RegisterPaymentDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEditMode = Boolean(existingPayment);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [amount, setAmount] = useState<string>(pendingBalance.toString());
  const [creditAmount, setCreditAmount] = useState<string>("0");
  const [paymentDate, setPaymentDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxAllowedAmount = useMemo(() => {
    if (isEditMode) {
      return pendingBalance + (existingPayment?.amount ?? 0);
    }
    return pendingBalance;
  }, [existingPayment?.amount, isEditMode, pendingBalance]);

  const shouldFetchCredit = !isEditMode && open && Boolean(counterpartyId);
  const { data: creditBalance = 0, isFetching: isFetchingCredit } =
    useQuery<number>({
      queryKey: [
        type === "receivable" ? "customer-credit" : "supplier-credit",
        orgSlug,
        counterpartyId,
      ],
      queryFn: async () => {
        const endpoint =
          type === "receivable"
            ? `/api/collections/customer-credit?orgSlug=${orgSlug}&customerId=${counterpartyId}`
            : `/api/purchases/supplier-credit-balance?orgSlug=${orgSlug}&supplierId=${counterpartyId}`;

        const response = await fetch(endpoint);
        if (!response.ok) {
          return 0;
        }

        const data = await response.json();
        return type === "receivable"
          ? (data.creditBalance ?? 0)
          : (data.balance ?? 0);
      },
      enabled: shouldFetchCredit,
    });

  const availableCredit = useMemo(
    () => Math.max(0, Math.min(creditBalance, pendingBalance)),
    [creditBalance, pendingBalance]
  );
  const showCreditSection =
    !isEditMode &&
    pendingBalance > 0 &&
    (isFetchingCredit || creditBalance > 0);

  const normalizePaymentMethod = (
    value?:
      | Database["public"]["Enums"]["payment_method"]
      | Database["public"]["Enums"]["payment_method_type"]
      | PaymentMethod
      | null
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
      case "tarjeta de credito":
        return "tarjeta_de_credito";
      case "TARJETA_DEBITO":
      case "tarjeta_de_debito":
      case "tarjeta de debito":
        return "tarjeta_de_debito";
      case "deposito":
        return "deposito";
      case "e-cheq":
        return "e-cheq";
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
      setCreditAmount("0");
    } else {
      setPaymentMethod("efectivo");
      setAmount(pendingBalance.toString());
      setCreditAmount("0");
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

  const validateAmountValue = (parsedAmount: number) => {
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return "Ingresa un monto válido.";
    }
    return null;
  };

  const validateCreditValue = (parsedCredit: number) => {
    if (!Number.isFinite(parsedCredit) || parsedCredit < 0) {
      return "Ingresa un crédito válido.";
    }
    return null;
  };

  const validateMinimums = ({
    parsedAmount,
    parsedCredit,
  }: {
    parsedAmount: number;
    parsedCredit: number;
  }) => {
    if (isEditMode) {
      return parsedAmount <= 0 ? "Ingresa un monto mayor a cero." : null;
    }
    return parsedAmount <= 0 && parsedCredit <= 0
      ? "Ingresa un monto mayor a cero o utiliza crédito."
      : null;
  };

  const validateCreditLimit = (parsedCredit: number) =>
    parsedCredit > availableCredit ? "El crédito excede el disponible." : null;

  const validateTotals = ({
    parsedAmount,
    parsedCredit,
  }: {
    parsedAmount: number;
    parsedCredit: number;
  }) =>
    parsedAmount + parsedCredit > maxAllowedAmount
      ? "El monto excede el saldo pendiente."
      : null;

  const adjustAmountForCredit = (nextCredit: number) => {
    if (isEditMode) {
      return;
    }

    if (!Number.isFinite(nextCredit)) {
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      return;
    }

    if (parsedAmount + nextCredit <= maxAllowedAmount) {
      return;
    }

    const nextAmount = Math.max(0, maxAllowedAmount - nextCredit);
    setAmount(nextAmount.toFixed(2));
  };

  const adjustCreditForAmount = (nextAmount: number) => {
    if (isEditMode) {
      return;
    }

    if (!Number.isFinite(nextAmount)) {
      return;
    }

    const parsedCredit = Number(creditAmount);
    if (!Number.isFinite(parsedCredit)) {
      return;
    }

    if (nextAmount + parsedCredit <= maxAllowedAmount) {
      return;
    }

    const nextCredit = Math.max(0, maxAllowedAmount - nextAmount);
    setCreditAmount(nextCredit.toFixed(2));
  };

  const getValidationError = ({
    parsedAmount,
    parsedCredit,
  }: {
    parsedAmount: number;
    parsedCredit: number;
  }) => {
    const errors = [
      validateAmountValue(parsedAmount),
      isEditMode ? null : validateCreditValue(parsedCredit),
      validateMinimums({ parsedAmount, parsedCredit }),
      isEditMode ? null : validateCreditLimit(parsedCredit),
      validateTotals({ parsedAmount, parsedCredit }),
    ];

    return errors.find(Boolean) ?? null;
  };

  const handleSubmit = () => {
    setError(null);
    const parsedAmount = Number(amount);
    const parsedCredit = isEditMode ? 0 : Number(creditAmount);

    const validationError = getValidationError({
      parsedAmount,
      parsedCredit,
    });

    if (validationError) {
      setError(validationError);
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
            creditAmount: parsedCredit,
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
        setCreditAmount("0");
        setReferenceNumber("");
        setNotes("");
      }
      onCompleted?.();
      queryClient.invalidateQueries({ queryKey: ["customer-credit"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credit"] });
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
              onChange={(event) => {
                const nextValue = event.target.value;
                setAmount(nextValue);
                adjustCreditForAmount(Number(nextValue));
              }}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={amount}
            />
          </div>

          {showCreditSection ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Crédito disponible</p>
                  {isFetchingCredit ? (
                    <p className="text-muted-foreground text-xs">
                      Consultando crédito...
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {formatCurrency(creditBalance)}
                    </p>
                  )}
                </div>
                <Button
                  className="h-8"
                  disabled={isFetchingCredit || availableCredit <= 0}
                  onClick={() => {
                    const nextCredit = availableCredit;
                    setCreditAmount(nextCredit.toFixed(2));
                    adjustAmountForCredit(nextCredit);
                  }}
                  type="button"
                  variant="outline"
                >
                  Usar todo
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                <Label htmlFor="creditAmount">Crédito a usar</Label>
                <Input
                  id="creditAmount"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCreditAmount(nextValue);
                    adjustAmountForCredit(Number(nextValue));
                  }}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={creditAmount}
                />
                <p className="text-muted-foreground text-xs">
                  Máximo aplicable: {formatCurrency(availableCredit)}
                </p>
              </div>
            </div>
          ) : null}

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
