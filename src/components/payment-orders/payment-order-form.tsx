"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircleIcon,
  MinusCircleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { generateId } from "@/lib/id";
import { cn } from "@/lib/utils";
import { createPaymentOrderAction } from "@/modules/payment-orders/actions/create-payment-order.action";
import { paymentOrdersQueryKey } from "@/modules/payment-orders/queries/query-keys";
import {
  calculatePaymentSummary,
  PAYMENT_METHOD_LABELS,
  type PaymentMethodType,
  RETENTION_METHODS,
} from "@/modules/payment-orders/types";

const paymentMethodSchema = z.object({
  id: z.string(),
  method_type: z.enum([
    "transfer",
    "check",
    "retention_iibb",
    "retention_gcias",
    "retention_suss",
    "cash",
  ] as const),
  amount: z.coerce.number().positive("El importe debe ser mayor a 0"),
  reference: z.string().optional(),
  bank_name: z.string().optional(),
  due_date: z.string().optional(),
});

const formSchema = z.object({
  paymentDate: z.string().min(1, "Seleccioná una fecha"),
  notes: z.string().optional(),
  methods: z.array(paymentMethodSchema),
  invoices: z
    .array(
      z.object({
        purchase_order_id: z.string(),
        purchase_number: z.number().nullable(),
        supplier_name: z.string(),
        total_amount: z.number(),
        amount_applied: z.number().positive("El monto debe ser mayor a 0"),
      })
    )
    .min(1, "Seleccioná al menos una factura"),
});

type FormValues = z.infer<typeof formSchema>;

type PaymentOrderFormProps = {
  orgSlug: string;
  supplierId: string;
  supplierName: string;
  pendingInvoices: Array<{
    purchase_order_id: string;
    purchase_number: number | null;
    total_amount: number;
  }>;
};

function getButtonText(isSubmitting: boolean): string {
  return isSubmitting ? "Confirmando..." : "Confirmar orden de pago";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: formulario con facturas + metodos + resumen contable
export function PaymentOrderForm({
  orgSlug,
  supplierId,
  supplierName,
  pendingInvoices,
}: PaymentOrderFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultValues = useMemo<FormValues>(
    () => ({
      paymentDate: new Date().toISOString().split("T")[0],
      notes: "",
      methods: [],
      invoices: [],
    }),
    []
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = form;

  const watchedInvoices = watch("invoices") ?? [];
  const watchedMethods = watch("methods") ?? [];

  const summary = calculatePaymentSummary(
    watchedInvoices,
    watchedMethods.map((m) => ({ ...m, id: m.id || "" }))
  );

  // Toggle invoice on/off
  const toggleInvoice = (inv: (typeof pendingInvoices)[0]) => {
    const current = watchedInvoices;
    const exists = current.find(
      (i) => i.purchase_order_id === inv.purchase_order_id
    );
    if (exists) {
      setValue(
        "invoices",
        current.filter((i) => i.purchase_order_id !== inv.purchase_order_id)
      );
    } else {
      setValue("invoices", [
        ...current,
        {
          purchase_order_id: inv.purchase_order_id,
          purchase_number: inv.purchase_number,
          supplier_name: supplierName,
          total_amount: inv.total_amount,
          amount_applied: inv.total_amount,
        },
      ]);
    }
  };

  const updateInvoiceAmount = (id: string, amount: number) => {
    setValue(
      "invoices",
      watchedInvoices.map((i) =>
        i.purchase_order_id === id
          ? { ...i, amount_applied: truncateMoney(amount) }
          : i
      )
    );
  };

  // Add/remove methods
  const [newMethodType, setNewMethodType] =
    useState<PaymentMethodType>("transfer");
  const [newMethodAmount, setNewMethodAmount] = useState("");
  const [newMethodRef, setNewMethodRef] = useState("");
  const [newMethodBank, setNewMethodBank] = useState("");
  const [newMethodDue, setNewMethodDue] = useState("");

  function addMethod() {
    const amount = Number.parseFloat(newMethodAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("El importe debe ser mayor a cero");
      return;
    }
    const newMethod: FormValues["methods"][number] = {
      id: generateId(),
      method_type: newMethodType,
      amount: truncateMoney(amount),
      reference: newMethodRef || undefined,
      bank_name: newMethodBank || undefined,
      due_date: newMethodDue || undefined,
    };
    setValue("methods", [...watchedMethods, newMethod]);
    setNewMethodAmount("");
    setNewMethodRef("");
    setNewMethodBank("");
    setNewMethodDue("");
  }

  function removeMethod(id: string) {
    setValue(
      "methods",
      watchedMethods.filter((m) => m.id !== id)
    );
  }

  const onSubmit = async (values: FormValues) => {
    if (!summary.isBalanced) {
      setErrorMessage(
        `La diferencia a cancelar debe ser $0. Diferencia: ${formatCurrency(summary.balance)}`
      );
      return;
    }

    setErrorMessage(null);
    try {
      const result = await createPaymentOrderAction({
        orgSlug,
        supplier_id: supplierId,
        payment_date: values.paymentDate,
        invoices: values.invoices.map(
          ({
            purchase_order_id,
            purchase_number,
            supplier_name: invSupplier,
            total_amount,
            amount_applied,
          }) => ({
            purchase_order_id,
            purchase_number,
            supplier_name: invSupplier,
            total_amount,
            amount_applied,
          })
        ),
        methods: values.methods.map(
          ({ method_type, amount, reference, bank_name, due_date }) => ({
            method_type,
            amount,
            reference: reference || undefined,
            bank_name: bank_name || undefined,
            due_date: due_date || undefined,
          })
        ),
        notes: values.notes || undefined,
      });

      if (result.success) {
        toast.success("Orden de pago creada correctamente");
        queryClient.invalidateQueries({
          queryKey: paymentOrdersQueryKey(orgSlug),
        });
      } else {
        setErrorMessage(result.error ?? "Error al crear la orden de pago");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Facturas a cancelar</CardTitle>
                <CardDescription>
                  Seleccioná las facturas del proveedor que se cancelan con esta
                  orden de pago y editá el monto a aplicar en cada una.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvoices.length === 0 && (
                  <p className="py-4 text-center text-muted-foreground text-sm">
                    No hay facturas pendientes para este proveedor.
                  </p>
                )}
                {pendingInvoices.map((inv) => {
                  const selected = watchedInvoices.find(
                    (i) => i.purchase_order_id === inv.purchase_order_id
                  );
                  return (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/40"
                      )}
                      key={inv.purchase_order_id}
                    >
                      <input
                        checked={!!selected}
                        className="sr-only"
                        onChange={() => toggleInvoice(inv)}
                        type="checkbox"
                      />
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border-2",
                          selected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        )}
                      >
                        {selected && (
                          <CheckCircleIcon
                            className="size-3 text-white"
                            weight="bold"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">
                          OC #{inv.purchase_number ?? "—"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Total: {formatCurrency(inv.total_amount)}
                        </p>
                      </div>
                      {selected && (
                        <div className="flex items-center gap-1.5" role="none">
                          <span className="text-muted-foreground text-xs">
                            $
                          </span>
                          <Input
                            className="h-7 w-28 text-sm"
                            max={inv.total_amount}
                            min="0.01"
                            onChange={(e) =>
                              updateInvoiceAmount(
                                inv.purchase_order_id,
                                Number.parseFloat(e.target.value) || 0
                              )
                            }
                            step="0.01"
                            type="number"
                            value={selected.amount_applied}
                          />
                        </div>
                      )}
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Métodos de pago</CardTitle>
                <CardDescription>
                  Agregá transferencias, cheques propios y retenciones. Las
                  retenciones descuentan del total a pagar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {watchedMethods.length > 0 && (
                  <div className="space-y-2">
                    {watchedMethods.map((m) => (
                      <div
                        className="flex items-center gap-3 rounded-lg border px-3 py-2"
                        key={m.id}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              className="text-xs"
                              variant={
                                RETENTION_METHODS.includes(m.method_type)
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {PAYMENT_METHOD_LABELS[m.method_type]}
                            </Badge>
                            {m.reference && (
                              <span className="font-mono text-muted-foreground text-xs">
                                {m.reference}
                              </span>
                            )}
                          </div>
                          {m.bank_name && (
                            <p className="mt-0.5 text-muted-foreground text-xs">
                              {m.bank_name}
                              {m.due_date ? ` · Vence ${m.due_date}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-semibold text-sm tabular-nums",
                              RETENTION_METHODS.includes(m.method_type)
                                ? "text-destructive"
                                : "text-foreground"
                            )}
                          >
                            {RETENTION_METHODS.includes(m.method_type)
                              ? "-"
                              : ""}
                            {formatCurrency(m.amount)}
                          </span>
                          <Button
                            className="size-7"
                            onClick={() => removeMethod(m.id)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <TrashIcon className="size-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 rounded-lg border border-dashed p-4">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    Agregar método
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Select
                        onValueChange={(v) =>
                          setNewMethodType(v as PaymentMethodType)
                        }
                        value={newMethodType}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.entries(PAYMENT_METHOD_LABELS) as [
                              PaymentMethodType,
                              string,
                            ][]
                          ).map(([type, label]) => (
                            <SelectItem key={type} value={type}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Importe</Label>
                      <Input
                        min="0.01"
                        onChange={(e) => setNewMethodAmount(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        type="number"
                        value={newMethodAmount}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">
                        Referencia / Nro. cheque
                      </Label>
                      <Input
                        onChange={(e) => setNewMethodRef(e.target.value)}
                        placeholder="Opcional"
                        value={newMethodRef}
                      />
                    </div>
                    {(newMethodType === "check" ||
                      newMethodType === "transfer") && (
                      <>
                        <div>
                          <Label className="text-xs">Banco</Label>
                          <Input
                            onChange={(e) => setNewMethodBank(e.target.value)}
                            placeholder="ICBC, Galicia..."
                            value={newMethodBank}
                          />
                        </div>
                        {newMethodType === "check" && (
                          <div>
                            <Label className="text-xs">
                              Fecha de acreditación
                            </Label>
                            <Input
                              onChange={(e) => setNewMethodDue(e.target.value)}
                              type="date"
                              value={newMethodDue}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <Button
                    className="gap-2"
                    onClick={addMethod}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon className="size-4" />
                    Agregar
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs">
                        Notas
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Observaciones de la orden de pago..."
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-base">Resumen</CardTitle>
                <CardDescription>{supplierName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="paymentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs">
                        Fecha de pago
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total facturas
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(summary.totalInvoices)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagos</span>
                    <span className="font-medium text-green-600 tabular-nums">
                      {formatCurrency(summary.totalPayments)}
                    </span>
                  </div>
                  {summary.totalRetentions > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Retenciones</span>
                      <span className="font-medium text-red-600 tabular-nums">
                        -{formatCurrency(summary.totalRetentions)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Neto pagado</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(summary.netPayment)}
                    </span>
                  </div>
                </div>

                <Separator />

                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg p-3",
                    summary.isBalanced
                      ? "border border-green-200 bg-green-50"
                      : "border border-red-200 bg-red-50"
                  )}
                >
                  {summary.isBalanced ? (
                    <CheckCircleIcon
                      className="size-5 shrink-0 text-green-600"
                      weight="fill"
                    />
                  ) : (
                    <WarningCircleIcon
                      className="size-5 shrink-0 text-red-600"
                      weight="fill"
                    />
                  )}
                  <div>
                    <p
                      className={cn(
                        "font-semibold text-sm",
                        summary.isBalanced ? "text-green-700" : "text-red-700"
                      )}
                    >
                      {summary.isBalanced
                        ? "Diferencia: $0,00 ✓"
                        : `Diferencia: ${formatCurrency(summary.balance)}`}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        summary.isBalanced ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {summary.isBalanced
                        ? "El asiento contable está balanceado"
                        : "El asiento debe cerrar en cero para confirmar"}
                    </p>
                  </div>
                </div>

                {!summary.isBalanced && summary.balance > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <MinusCircleIcon className="size-3.5 shrink-0" />
                    <span>
                      Falta agregar{" "}
                      <strong>{formatCurrency(summary.balance)}</strong> en
                      métodos de pago
                    </span>
                  </div>
                )}

                {errorMessage && (
                  <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                    {errorMessage}
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={
                    !summary.isBalanced ||
                    watchedInvoices.length === 0 ||
                    watchedMethods.length === 0 ||
                    isSubmitting
                  }
                  size="lg"
                  type="submit"
                >
                  {getButtonText(isSubmitting)}
                </Button>

                {!summary.isBalanced && (
                  <p className="text-center text-muted-foreground text-xs">
                    El botón se habilita cuando la diferencia sea $0
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
