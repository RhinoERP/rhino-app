"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { AnyEvento } from "@/modules/accounting/types";
import {
  markPaymentAccountingJournalAction,
  registerPaymentAction,
} from "@/modules/collections/actions/register-payment.action";
import { updatePaymentAction } from "@/modules/collections/actions/update-payment.action";
import type {
  CreditBreakdownEntry,
  CustomerCreditApiResponse,
  PaymentMethod,
} from "@/modules/collections/types";
import { useTreasuryOperationId } from "@/modules/treasury/hooks/use-treasury-operation-id";
import {
  useChequesRecibidos,
  useCuentasBancarias,
} from "@/modules/treasury/queries/queries.client";
import type { Database } from "@/types/supabase";

type RegisterPaymentDialogProps = {
  orgSlug: string;
  orgId?: string;
  accountId: string;
  type: "receivable" | "payable";
  pendingBalance: number;
  totalAmount: number;
  counterpartyName: string;
  counterpartyId: string;
  supplierId?: string | null;
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
  { value: "cheque_endosado", label: "Cheque endosado" },
  { value: "deposito", label: "Depósito" },
  { value: "e-cheq", label: "E-Cheq" },
];

const textareaClasses =
  "min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
const formatMoneyInput = (value: number) => truncateMoney(value).toFixed(2);

function CreditSection({
  creditBalance,
  availableCredit,
  supplierCreditEnabled,
  bySupplier,
  supplierId,
  isFetchingCredit,
  creditAmount,
  onCreditAmountChange,
  onUseAllCredit,
}: {
  creditBalance: number;
  availableCredit: number;
  supplierCreditEnabled: boolean;
  bySupplier: CreditBreakdownEntry[];
  supplierId: string | null | undefined;
  isFetchingCredit: boolean;
  creditAmount: string;
  onCreditAmountChange: (value: string) => void;
  onUseAllCredit: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      {supplierCreditEnabled && bySupplier.length > 1 ? (
        <Collapsible>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Crédito disponible por proveedor</p>
              <p className="text-muted-foreground text-xs">
                {formatCurrency(creditBalance)}
              </p>
            </div>
            <Button
              className="h-8"
              disabled={isFetchingCredit || availableCredit <= 0}
              onClick={onUseAllCredit}
              type="button"
              variant="outline"
            >
              Usar todo
            </Button>
          </div>
          <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-muted-foreground text-xs hover:text-foreground">
            <span>Ver desglose</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 py-1">
            {bySupplier.map((entry) => (
              <div
                className="flex items-center justify-between text-xs"
                key={entry.supplierId ?? "null"}
              >
                <span className="text-muted-foreground">
                  {entry.supplierName}
                </span>
                <span
                  className={
                    entry.supplierId === supplierId
                      ? "font-medium text-emerald-600"
                      : ""
                  }
                >
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : (
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
            onClick={onUseAllCredit}
            type="button"
            variant="outline"
          >
            Usar todo
          </Button>
        </div>
      )}
      <div className="mt-3 grid gap-2">
        <Label htmlFor="creditAmount">Crédito a usar</Label>
        <Input
          id="creditAmount"
          inputMode="decimal"
          min={0}
          onChange={(event) => onCreditAmountChange(event.target.value)}
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
  );
}

function EndorsedChecksSection({
  checks,
  selectedIds,
  totalSelected,
  pendingBalance,
  onToggle,
}: {
  checks: Array<{
    id: string;
    numero_cheque: string;
    banco_emisor: string;
    librador: string | null;
    importe: string;
    fecha_vencimiento: string;
    tipo: string;
  }>;
  selectedIds: string[];
  totalSelected: number;
  pendingBalance: number;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const remainingBalance = truncateMoney(
    Math.max(0, pendingBalance - totalSelected)
  );

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Cheques recibidos a endosar</p>
          <p className="text-muted-foreground text-xs">
            Selecciona cheques en cartera. El monto del pago se calcula con la
            suma seleccionada.
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="text-muted-foreground">Saldo restante</p>
          <p className="font-medium text-foreground">
            {formatCurrency(remainingBalance)}
          </p>
        </div>
      </div>

      {checks.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
          No hay cheques recibidos en cartera para endosar.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>N° Cheque</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Banco emisor</TableHead>
                <TableHead>Librador</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((check) => (
                <TableRow
                  className="cursor-pointer"
                  key={check.id}
                  onClick={() => onToggle(check.id, !selectedSet.has(check.id))}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedSet.has(check.id)}
                      onCheckedChange={(checked) =>
                        onToggle(check.id, checked === true)
                      }
                      onClick={(event) => event.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {check.numero_cheque}
                  </TableCell>
                  <TableCell className="text-sm">{check.tipo}</TableCell>
                  <TableCell className="text-sm">
                    {check.banco_emisor}
                  </TableCell>
                  <TableCell className="text-sm">
                    {check.librador ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {check.fecha_vencimiento.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(Number(check.importe))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span>
          {selectedIds.length} cheque{selectedIds.length !== 1 ? "s" : ""}{" "}
          seleccionado{selectedIds.length !== 1 ? "s" : ""}
        </span>
        <span className="font-semibold tabular-nums">
          Total: {formatCurrency(totalSelected)}
        </span>
      </div>
    </div>
  );
}

function normalizePaymentMethod(
  value?:
    | Database["public"]["Enums"]["payment_method"]
    | Database["public"]["Enums"]["payment_method_type"]
    | PaymentMethod
    | null
): PaymentMethod {
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
}

function normalizeDate(value?: string | null): string {
  if (!value) {
    return new Date().toISOString().split("T")[0];
  }
  return value.split("T")[0] ?? value;
}

function getWarningMessage(
  isEditMode: boolean,
  amount: string,
  creditAmount: string,
  pendingBalance: number
): string | null {
  if (isEditMode) {
    return null;
  }
  const parsedAmount = truncateMoney(Number(amount));
  const parsedCredit = truncateMoney(Number(creditAmount));
  const total = truncateMoney(parsedAmount + parsedCredit);
  if (total > pendingBalance) {
    const excedente = truncateMoney(total - pendingBalance);
    return `El monto ingresado supera la deuda en $${excedente.toFixed(2)}. El excedente quedará como saldo a favor.`;
  }
  return null;
}

function getDueLabel(dueDate?: string | null): string {
  if (!dueDate) {
    return "Sin vencimiento";
  }
  return formatDateOnly(dueDate);
}

function useCreditQuery({
  type,
  orgSlug,
  counterpartyId,
  supplierId,
  isEditMode,
  open,
  pendingBalance,
}: {
  type: "receivable" | "payable";
  orgSlug: string;
  counterpartyId: string;
  supplierId?: string | null;
  isEditMode: boolean;
  open: boolean;
  pendingBalance: number;
}) {
  const shouldFetchCredit = !isEditMode && open && Boolean(counterpartyId);
  const creditQuery = useQuery<CustomerCreditApiResponse>({
    queryKey: [
      type === "receivable" ? "customer-credit" : "supplier-credit",
      orgSlug,
      counterpartyId,
      supplierId,
    ],
    queryFn: async () => {
      const endpoint =
        type === "receivable"
          ? `/api/collections/customer-credit?orgSlug=${orgSlug}&customerId=${counterpartyId}${supplierId ? `&supplierId=${supplierId}` : ""}`
          : `/api/purchases/supplier-credit-balance?orgSlug=${orgSlug}&supplierId=${counterpartyId}`;

      const response = await fetch(endpoint);
      if (!response.ok) {
        return { total: 0, enabled: false, bySupplier: [] };
      }

      const data = await response.json();
      if (type === "receivable") {
        return data as CustomerCreditApiResponse;
      }
      return {
        total: data.balance ?? 0,
        enabled: false,
        bySupplier: [],
      } as CustomerCreditApiResponse;
    },
    enabled: shouldFetchCredit,
  });

  const { data: creditData, isFetching: isFetchingCredit } = creditQuery;
  const creditBalance = creditData?.total ?? 0;
  const supplierCreditEnabled = creditData?.enabled ?? false;
  const bySupplier = creditData?.bySupplier ?? [];

  const availableCredit = useMemo(
    () => truncateMoney(Math.max(0, Math.min(creditBalance, pendingBalance))),
    [creditBalance, pendingBalance]
  );
  const showCreditSection =
    !isEditMode &&
    pendingBalance > 0 &&
    (isFetchingCredit || creditBalance > 0);

  return {
    creditBalance,
    supplierCreditEnabled,
    bySupplier,
    availableCredit,
    showCreditSection,
    isFetchingCredit,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this dialog coordinates multiple payment variants over a shared form state surface.
export function RegisterPaymentDialog({
  orgSlug,
  orgId,
  accountId,
  type,
  pendingBalance,
  totalAmount,
  counterpartyName,
  counterpartyId,
  supplierId,
  dueDate,
  trigger,
  existingPayment,
  onCompleted,
}: RegisterPaymentDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getOperationId, resetOperationId } = useTreasuryOperationId();
  const [open, setOpen] = useState(false);
  const isEditMode = Boolean(existingPayment);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [amount, setAmount] = useState<string>(
    formatMoneyInput(pendingBalance)
  );
  const [creditAmount, setCreditAmount] = useState<string>("0");
  const [paymentDate, setPaymentDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [accountingPayload, setAccountingPayload] = useState<AnyEvento | null>(
    null
  );
  const [accountingPaymentId, setAccountingPaymentId] = useState<string | null>(
    null
  );
  const isCheckMethod =
    paymentMethod === "cheque" || paymentMethod === "e-cheq";
  const isEndorsedCheckMethod = paymentMethod === "cheque_endosado";
  const { data: cuentasBancarias = [] } = useCuentasBancarias(orgId ?? "", {
    soloActivas: true,
    enabled: type === "payable" && open && !!orgId,
  });
  const [selectedReceivedCheckIds, setSelectedReceivedCheckIds] = useState<
    string[]
  >([]);
  const { data: receivedChecks = [] } = useChequesRecibidos(
    orgId ?? "",
    "EN_CARTERA",
    {
      enabled:
        type === "payable" &&
        open &&
        !!orgId &&
        !isEditMode &&
        isEndorsedCheckMethod,
    }
  );

  // Cheque data (solo para type=payable con cheque/e-cheq)
  const [chequeCuentaBancariaId, setChequeCuentaBancariaId] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");
  const [chequeFechaEmision, setChequeFechaEmision] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [chequeFechaDebito, setChequeFechaDebito] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [chequeBeneficiario, setChequeBeneficiario] =
    useState(counterpartyName);

  const warningMessage = useMemo(
    () => getWarningMessage(isEditMode, amount, creditAmount, pendingBalance),
    [amount, creditAmount, isEditMode, pendingBalance]
  );

  const availablePaymentMethodOptions = useMemo(() => {
    if (isEditMode) {
      return paymentMethodOptions.filter(
        (option) => option.value !== "cheque_endosado"
      );
    }
    if (type !== "payable") {
      return paymentMethodOptions.filter(
        (option) => option.value !== "cheque_endosado"
      );
    }
    return paymentMethodOptions;
  }, [isEditMode, type]);

  const selectedReceivedChecks = useMemo(
    () =>
      receivedChecks.filter((check) =>
        selectedReceivedCheckIds.includes(check.id)
      ),
    [receivedChecks, selectedReceivedCheckIds]
  );

  const selectedReceivedChecksTotal = useMemo(
    () =>
      truncateMoney(
        selectedReceivedChecks.reduce(
          (sum, check) => sum + Number(check.importe),
          0
        )
      ),
    [selectedReceivedChecks]
  );

  const {
    creditBalance,
    supplierCreditEnabled,
    bySupplier,
    availableCredit,
    showCreditSection,
    isFetchingCredit,
  } = useCreditQuery({
    type,
    orgSlug,
    counterpartyId,
    supplierId,
    isEditMode,
    open,
    pendingBalance,
  });

  const maxCreditForCurrentSelection = useMemo(() => {
    if (isEditMode) {
      return 0;
    }

    const remainingPending = isEndorsedCheckMethod
      ? truncateMoney(Math.max(0, pendingBalance - selectedReceivedChecksTotal))
      : pendingBalance;

    return truncateMoney(
      Math.max(0, Math.min(availableCredit, remainingPending))
    );
  }, [
    availableCredit,
    isEditMode,
    isEndorsedCheckMethod,
    pendingBalance,
    selectedReceivedChecksTotal,
  ]);

  const resetForm = () => {
    if (existingPayment) {
      setPaymentMethod(normalizePaymentMethod(existingPayment.payment_method));
      setAmount(formatMoneyInput(existingPayment.amount ?? pendingBalance));
      setPaymentDate(normalizeDate(existingPayment.payment_date));
      setReferenceNumber(existingPayment.reference_number ?? "");
      setNotes(existingPayment.notes ?? "");
      setCreditAmount("0");
    } else {
      setPaymentMethod("efectivo");
      setAmount(formatMoneyInput(pendingBalance));
      setCreditAmount("0");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setReferenceNumber("");
      setNotes("");
    }
    setError(null);
    setAccountingPayload(null);
    setAccountingPaymentId(null);
    setChequeCuentaBancariaId("");
    setChequeNumero("");
    setChequeFechaEmision(new Date().toISOString().split("T")[0]);
    setChequeFechaDebito(new Date().toISOString().split("T")[0]);
    setChequeBeneficiario(counterpartyName);
    setSelectedReceivedCheckIds([]);
    resetOperationId();
  };

  const finalizePaymentFlow = () => {
    setOpen(false);
    onCompleted?.();
    queryClient.invalidateQueries({ queryKey: ["customer-credit"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-credit"] });
    queryClient.invalidateQueries({ queryKey: ["credit-notes", orgSlug] });
    queryClient.invalidateQueries({
      queryKey: ["treasury", "issued-checks", orgId],
    });
  };

  useEffect(() => {
    if (isEditMode) {
      return;
    }
    setAmount(formatMoneyInput(pendingBalance));
  }, [isEditMode, pendingBalance]);

  useEffect(() => {
    if (isEditMode || !isEndorsedCheckMethod) {
      return;
    }

    setAmount(formatMoneyInput(selectedReceivedChecksTotal));
  }, [isEditMode, isEndorsedCheckMethod, selectedReceivedChecksTotal]);

  useEffect(() => {
    if (isEditMode) {
      return;
    }

    const currentCredit = truncateMoney(Number(creditAmount));
    if (
      !Number.isFinite(currentCredit) ||
      currentCredit <= maxCreditForCurrentSelection
    ) {
      return;
    }

    setCreditAmount(formatMoneyInput(maxCreditForCurrentSelection));
  }, [creditAmount, isEditMode, maxCreditForCurrentSelection]);

  const dueLabel = useMemo(() => getDueLabel(dueDate), [dueDate]);

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
    parsedCredit > maxCreditForCurrentSelection
      ? "El crédito excede el disponible."
      : null;

  const validateTotals = ({
    parsedAmount,
    parsedCredit,
  }: {
    parsedAmount: number;
    parsedCredit: number;
  }) =>
    isEditMode &&
    truncateMoney(parsedAmount + parsedCredit) >
      truncateMoney(pendingBalance + (existingPayment?.amount ?? 0))
      ? "El monto excede el saldo pendiente."
      : null;

  const adjustAmountForCredit = (nextCredit: number) => {
    if (isEditMode) {
      return;
    }

    if (isEndorsedCheckMethod) {
      return;
    }

    if (!Number.isFinite(nextCredit)) {
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      return;
    }

    if (truncateMoney(parsedAmount + nextCredit) <= pendingBalance) {
      return;
    }

    const adjustedAmount = truncateMoney(
      Math.max(0, pendingBalance - nextCredit)
    );
    setAmount(formatMoneyInput(adjustedAmount));
  };

  const adjustCreditForAmount = (_nextAmount: number) => {
    // Si el usuario sube el monto manualmente, se muestra el banner de advertencia
  };

  const validateIssuedCheckFields = () => {
    const hasAllIssuedCheckFields = Boolean(
      chequeNumero.trim() &&
        chequeCuentaBancariaId &&
        chequeFechaEmision &&
        chequeFechaDebito &&
        chequeBeneficiario.trim()
    );

    if (!hasAllIssuedCheckFields) {
      return "Completa todos los datos del cheque propio.";
    }

    if (chequeFechaDebito < chequeFechaEmision) {
      return "La fecha de débito no puede ser anterior a la fecha de emisión.";
    }

    return null;
  };

  const validateEndorsedCheckFields = ({
    parsedAmount,
    parsedCredit,
  }: {
    parsedAmount: number;
    parsedCredit: number;
  }) => {
    if (!(type === "payable" && isEndorsedCheckMethod && !isEditMode)) {
      return null;
    }

    if (selectedReceivedCheckIds.length === 0) {
      return "Selecciona al menos un cheque recibido para endosar.";
    }

    if (truncateMoney(parsedAmount) !== selectedReceivedChecksTotal) {
      return "El monto debe coincidir con el total de cheques seleccionados.";
    }

    if (
      truncateMoney(parsedAmount + parsedCredit) > truncateMoney(pendingBalance)
    ) {
      return "La suma de cheques y crédito no puede exceder el saldo pendiente.";
    }

    return null;
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
      !isEditMode && type === "payable" && isCheckMethod
        ? validateIssuedCheckFields()
        : null,
      validateEndorsedCheckFields({ parsedAmount, parsedCredit }),
    ];

    return errors.find(Boolean) ?? null;
  };

  const runPaymentMutation = (params: {
    parsedAmount: number;
    parsedCredit: number;
  }) => {
    if (existingPayment) {
      return updatePaymentAction({
        orgSlug,
        accountId,
        paymentId: existingPayment.id,
        type,
        amount: params.parsedAmount,
        paymentMethod,
        paymentDate,
        referenceNumber,
        notes,
      });
    }

    const issuedCheckData =
      type === "payable" && isCheckMethod
        ? {
            cuentaBancariaId: chequeCuentaBancariaId,
            numeroCheque: chequeNumero,
            fechaEmision: chequeFechaEmision,
            fechaDebito: chequeFechaDebito,
            beneficiario: chequeBeneficiario,
          }
        : undefined;

    return registerPaymentAction({
      orgSlug,
      accountId,
      type,
      amount: params.parsedAmount,
      creditAmount: params.parsedCredit,
      paymentMethod,
      operationId: getOperationId(),
      paymentDate,
      referenceNumber,
      notes,
      receivedCheckIds: isEndorsedCheckMethod
        ? selectedReceivedCheckIds
        : undefined,
      issuedCheckData,
    });
  };

  const getPaymentErrorMessage = (result: { error?: string }) => {
    if (result.error) {
      return result.error;
    }

    return existingPayment
      ? "No se pudo actualizar el pago."
      : "No se pudo registrar el pago.";
  };

  const resetFormAfterPayment = (newPendingBalance: number) => {
    setAmount(formatMoneyInput(newPendingBalance));
    setCreditAmount("0");
    setReferenceNumber("");
    setNotes("");
    setSelectedReceivedCheckIds([]);
    resetOperationId();
  };

  const toggleReceivedCheck = (id: string, checked: boolean) => {
    setSelectedReceivedCheckIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return Array.from(next);
    });
  };

  const openAccountingReview = (result: {
    accountingEvent: AnyEvento;
    paymentId?: string;
  }) => {
    setOpen(false);
    setAccountingPayload(result.accountingEvent);
    setAccountingPaymentId(result.paymentId ?? null);
  };

  const handleSubmit = () => {
    setError(null);
    const parsedAmount = truncateMoney(Number(amount));
    const parsedCredit = isEditMode ? 0 : truncateMoney(Number(creditAmount));

    const validationError = getValidationError({
      parsedAmount,
      parsedCredit,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      const result = await runPaymentMutation({
        parsedAmount,
        parsedCredit,
      });

      if (!result.success) {
        setError(getPaymentErrorMessage(result));
        return;
      }

      if (!existingPayment) {
        resetFormAfterPayment(result.newPendingBalance);
      }

      if (
        !existingPayment &&
        "accountingEvent" in result &&
        result.accountingEvent
      ) {
        openAccountingReview({
          accountingEvent: result.accountingEvent,
          paymentId:
            "paymentId" in result ? (result.paymentId ?? undefined) : undefined,
        });
        return;
      }

      finalizePaymentFlow();
      router.refresh();
    });
  };

  const disabled = !isEditMode && pendingBalance <= 0;

  return (
    <>
      {accountingPayload ? (
        <AsientoModal
          eventoPayload={accountingPayload}
          mode="gate"
          onCancel={() => {
            setAccountingPayload(null);
            setAccountingPaymentId(null);
            finalizePaymentFlow();
          }}
          onConfirm={async (journalEntryId) => {
            if (accountingPaymentId) {
              const linkResult = await markPaymentAccountingJournalAction({
                orgSlug,
                type,
                paymentId: accountingPaymentId,
                journalEntryId,
              });

              if (!linkResult.success) {
                setError(linkResult.error);
                return;
              }
            }

            setAccountingPayload(null);
            setAccountingPaymentId(null);
            finalizePaymentFlow();
          }}
          open={Boolean(accountingPayload)}
          persistAs="formal"
        />
      ) : null}

      <Dialog
        onOpenChange={(nextOpen) => {
          if (accountingPayload) {
            return;
          }

          setOpen(nextOpen);
          if (nextOpen) {
            resetForm();
            return;
          }
          setError(null);
        }}
        open={open && !accountingPayload}
      >
        <DialogTrigger asChild>
          {trigger ?? (
            <Button disabled={disabled} size="sm" variant="outline">
              Registrar pago
            </Button>
          )}
        </DialogTrigger>
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${
            !isEditMode && type === "payable" && isEndorsedCheckMethod
              ? "sm:max-w-4xl"
              : "sm:max-w-lg"
          }`}
        >
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
                  <span className="font-medium text-foreground">
                    {dueLabel}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Saldo pendiente</p>
                <p className="font-semibold">
                  {formatCurrency(pendingBalance)}
                </p>
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
                  if (isEndorsedCheckMethod && !isEditMode) {
                    return;
                  }
                  const nextValue = event.target.value;
                  setAmount(nextValue);
                  adjustCreditForAmount(Number(nextValue));
                }}
                placeholder="0.00"
                readOnly={isEndorsedCheckMethod && !isEditMode}
                step="0.01"
                type="number"
                value={amount}
              />
            </div>

            {showCreditSection ? (
              <CreditSection
                availableCredit={maxCreditForCurrentSelection}
                bySupplier={bySupplier}
                creditAmount={creditAmount}
                creditBalance={creditBalance}
                isFetchingCredit={isFetchingCredit}
                onCreditAmountChange={(value) => {
                  setCreditAmount(value);
                  adjustAmountForCredit(Number(value));
                }}
                onUseAllCredit={() => {
                  const nextCredit = maxCreditForCurrentSelection;
                  setCreditAmount(formatMoneyInput(nextCredit));
                  adjustAmountForCredit(nextCredit);
                }}
                supplierCreditEnabled={supplierCreditEnabled}
                supplierId={supplierId}
              />
            ) : null}

            {!isEditMode && type === "payable" && isEndorsedCheckMethod ? (
              <EndorsedChecksSection
                checks={receivedChecks}
                onToggle={toggleReceivedCheck}
                pendingBalance={pendingBalance}
                selectedIds={selectedReceivedCheckIds}
                totalSelected={selectedReceivedChecksTotal}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="paymentMethod">Método de pago</Label>
                <Select
                  onValueChange={(value: PaymentMethod) => {
                    setPaymentMethod(value);
                    resetOperationId();

                    if (value !== "cheque_endosado") {
                      setSelectedReceivedCheckIds([]);
                      if (!isEditMode) {
                        setAmount(formatMoneyInput(pendingBalance));
                      }
                    }

                    if (value !== "cheque" && value !== "e-cheq") {
                      setChequeCuentaBancariaId("");
                      setChequeNumero("");
                    }
                  }}
                  value={paymentMethod}
                >
                  <SelectTrigger id="paymentMethod">
                    <SelectValue placeholder="Selecciona un método" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePaymentMethodOptions.map((option) => (
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

            {!isEditMode && type === "payable" && isCheckMethod ? (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <p className="font-medium text-sm">Datos del cheque propio</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="chequeNumero">N° de cheque *</Label>
                    <Input
                      id="chequeNumero"
                      onChange={(e) => setChequeNumero(e.target.value)}
                      placeholder="000001"
                      value={chequeNumero}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chequeFechaEmision">Fecha emisión *</Label>
                    <Input
                      id="chequeFechaEmision"
                      onChange={(e) => setChequeFechaEmision(e.target.value)}
                      type="date"
                      value={chequeFechaEmision}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="chequeFechaDebito">
                      Fecha débito/vencimiento *
                    </Label>
                    <Input
                      id="chequeFechaDebito"
                      onChange={(e) => setChequeFechaDebito(e.target.value)}
                      type="date"
                      value={chequeFechaDebito}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chequeBeneficiario">Beneficiario *</Label>
                    <Input
                      id="chequeBeneficiario"
                      onChange={(e) => setChequeBeneficiario(e.target.value)}
                      placeholder={counterpartyName}
                      value={chequeBeneficiario}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="chequeCuentaBancaria">
                    Cuenta bancaria propia *
                  </Label>
                  {cuentasBancarias.length > 0 ? (
                    <Select
                      onValueChange={setChequeCuentaBancariaId}
                      value={chequeCuentaBancariaId}
                    >
                      <SelectTrigger id="chequeCuentaBancaria">
                        <SelectValue placeholder="Selecciona una cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {cuentasBancarias.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre} — {c.banco}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
                      No hay cuentas bancarias activas. Crea una en Tesorería
                      antes de emitir el cheque.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

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
            {warningMessage ? (
              <p className="rounded-md bg-blue-50 px-3 py-2 text-blue-800 text-sm dark:bg-blue-900/20 dark:text-blue-400">
                {warningMessage}
              </p>
            ) : null}
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
    </>
  );
}
