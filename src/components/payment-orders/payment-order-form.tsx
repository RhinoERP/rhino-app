"use client";

import {
  CheckCircleIcon,
  MinusCircleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { createPaymentOrderAction } from "@/modules/payment-orders/actions/create-payment-order.action";
import {
  calculatePaymentSummary,
  type InvoiceToCancel,
  PAYMENT_METHOD_LABELS,
  type PaymentMethodLine,
  type PaymentMethodType,
  RETENTION_METHODS,
} from "@/modules/payment-orders/types";
import { toast } from "sonner";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

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

export function PaymentOrderForm({
  orgSlug,
  supplierId,
  supplierName,
  pendingInvoices,
}: PaymentOrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Facturas seleccionadas con monto aplicado
  const [invoices, setInvoices] = useState<InvoiceToCancel[]>([]);
  // Métodos de pago
  const [methods, setMethods] = useState<PaymentMethodLine[]>([]);
  // Datos generales
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  // Nuevo método a agregar
  const [newMethodType, setNewMethodType] =
    useState<PaymentMethodType>("transfer");
  const [newMethodAmount, setNewMethodAmount] = useState("");
  const [newMethodRef, setNewMethodRef] = useState("");
  const [newMethodBank, setNewMethodBank] = useState("");
  const [newMethodDue, setNewMethodDue] = useState("");

  const summary = calculatePaymentSummary(invoices, methods);

  // ── Facturas ──────────────────────────────────────────────
  const toggleInvoice = useCallback(
    (inv: (typeof pendingInvoices)[0]) => {
      setInvoices((prev) => {
        const exists = prev.find(
          (i) => i.purchase_order_id === inv.purchase_order_id
        );
        if (exists) {
          return prev.filter(
            (i) => i.purchase_order_id !== inv.purchase_order_id
          );
        }
        return [
          ...prev,
          {
            purchase_order_id: inv.purchase_order_id,
            purchase_number: inv.purchase_number,
            supplier_name: supplierName,
            total_amount: inv.total_amount,
            amount_applied: inv.total_amount, // default: cancela el total
          },
        ];
      });
    },
    [supplierName]
  );

  const updateInvoiceAmount = (id: string, amount: number) => {
    setInvoices((prev) =>
      prev.map((i) =>
        i.purchase_order_id === id ? { ...i, amount_applied: amount } : i
      )
    );
  };

  // ── Métodos de pago ───────────────────────────────────────
  function addMethod() {
    const amount = parseFloat(newMethodAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("El importe debe ser mayor a cero");
      return;
    }
    setMethods((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        method_type: newMethodType,
        amount,
        reference: newMethodRef || undefined,
        bank_name: newMethodBank || undefined,
        due_date: newMethodDue || undefined,
      },
    ]);
    setNewMethodAmount("");
    setNewMethodRef("");
    setNewMethodBank("");
    setNewMethodDue("");
  }

  function removeMethod(id: string) {
    setMethods((prev) => prev.filter((m) => m.id !== id));
  }

  // ── Submit ────────────────────────────────────────────────
  function handleSubmit() {
    if (!summary.isBalanced) {
      toast.error(
        `La diferencia a cancelar debe ser $0. Diferencia: ${currencyFormatter.format(summary.balance)}`
      );
      return;
    }

    startTransition(async () => {
      const result = await createPaymentOrderAction({
        orgSlug,
        supplier_id: supplierId,
        payment_date: paymentDate,
        invoices,
        methods: methods.map(({ id: _id, ...m }) => m),
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success("Orden de pago creada correctamente");
        router.push(`/org/${orgSlug}/compras`);
      } else {
        toast.error(result.error ?? "Error al crear la orden de pago");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* ── Columna izquierda: facturas + métodos ── */}
      <div className="lg:col-span-2 space-y-6">
        {/* Facturas a cancelar */}
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
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay facturas pendientes para este proveedor.
              </p>
            )}
            {pendingInvoices.map((inv) => {
              const selected = invoices.find(
                (i) => i.purchase_order_id === inv.purchase_order_id
              );
              return (
                <div
                  key={inv.purchase_order_id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40"
                  )}
                  onClick={() => toggleInvoice(inv)}
                  onKeyDown={(e) => e.key === "Enter" && toggleInvoice(inv)}
                  role="checkbox"
                  aria-checked={!!selected}
                  tabIndex={0}
                >
                  <div
                    className={cn(
                      "size-4 rounded border-2 flex items-center justify-center shrink-0",
                      selected ? "border-primary bg-primary" : "border-muted-foreground"
                    )}
                  >
                    {selected && (
                      <CheckCircleIcon className="size-3 text-white" weight="bold" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      OC #{inv.purchase_number ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total: {currencyFormatter.format(inv.total_amount)}
                    </p>
                  </div>
                  {selected && (
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="none"
                    >
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={selected.amount_applied}
                        onChange={(e) =>
                          updateInvoiceAmount(
                            inv.purchase_order_id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-28 h-7 text-sm"
                        step="0.01"
                        min="0.01"
                        max={inv.total_amount}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Métodos de pago */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Métodos de pago</CardTitle>
            <CardDescription>
              Agregá transferencias, cheques propios y retenciones. Las
              retenciones descuentan del total a pagar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lista de métodos agregados */}
            {methods.length > 0 && (
              <div className="space-y-2">
                {methods.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            RETENTION_METHODS.includes(m.method_type)
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {PAYMENT_METHOD_LABELS[m.method_type]}
                        </Badge>
                        {m.reference && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {m.reference}
                          </span>
                        )}
                      </div>
                      {m.bank_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.bank_name}
                          {m.due_date ? ` · Vence ${m.due_date}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          RETENTION_METHODS.includes(m.method_type)
                            ? "text-destructive"
                            : "text-foreground"
                        )}
                      >
                        {RETENTION_METHODS.includes(m.method_type) ? "-" : ""}
                        {currencyFormatter.format(m.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => removeMethod(m.id)}
                      >
                        <TrashIcon className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario agregar método */}
            <div className="rounded-lg border border-dashed p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Agregar método
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Select
                    value={newMethodType}
                    onValueChange={(v) =>
                      setNewMethodType(v as PaymentMethodType)
                    }
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
                    type="number"
                    placeholder="0.00"
                    value={newMethodAmount}
                    onChange={(e) => setNewMethodAmount(e.target.value)}
                    step="0.01"
                    min="0.01"
                  />
                </div>
                <div>
                  <Label className="text-xs">Referencia / Nro. cheque</Label>
                  <Input
                    placeholder="Opcional"
                    value={newMethodRef}
                    onChange={(e) => setNewMethodRef(e.target.value)}
                  />
                </div>
                {(newMethodType === "check" ||
                  newMethodType === "transfer") && (
                  <>
                    <div>
                      <Label className="text-xs">Banco</Label>
                      <Input
                        placeholder="ICBC, Galicia..."
                        value={newMethodBank}
                        onChange={(e) => setNewMethodBank(e.target.value)}
                      />
                    </div>
                    {newMethodType === "check" && (
                      <div>
                        <Label className="text-xs">
                          Fecha de acreditación
                        </Label>
                        <Input
                          type="date"
                          value={newMethodDue}
                          onChange={(e) => setNewMethodDue(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={addMethod}
              >
                <PlusIcon className="size-4" />
                Agregar
              </Button>
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notas</Label>
              <Textarea
                placeholder="Observaciones de la orden de pago..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Columna derecha: resumen y validación ── */}
      <div className="space-y-4">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription>{supplierName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fecha */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Fecha de pago
              </Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            <Separator />

            {/* Totales */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Total facturas
                </span>
                <span className="tabular-nums font-medium">
                  {currencyFormatter.format(summary.totalInvoices)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagos</span>
                <span className="tabular-nums font-medium text-green-600">
                  {currencyFormatter.format(summary.totalPayments)}
                </span>
              </div>
              {summary.totalRetentions > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retenciones</span>
                  <span className="tabular-nums font-medium text-red-600">
                    -{currencyFormatter.format(summary.totalRetentions)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Neto pagado</span>
                <span className="tabular-nums font-medium">
                  {currencyFormatter.format(summary.netPayment)}
                </span>
              </div>
            </div>

            <Separator />

            {/* Balance — el corazón de la validación */}
            <div
              className={cn(
                "rounded-lg p-3 flex items-center gap-3",
                summary.isBalanced
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              )}
            >
              {summary.isBalanced ? (
                <CheckCircleIcon
                  className="size-5 text-green-600 shrink-0"
                  weight="fill"
                />
              ) : (
                <WarningCircleIcon
                  className="size-5 text-red-600 shrink-0"
                  weight="fill"
                />
              )}
              <div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    summary.isBalanced ? "text-green-700" : "text-red-700"
                  )}
                >
                  {summary.isBalanced
                    ? "Diferencia: $0,00 ✓"
                    : `Diferencia: ${currencyFormatter.format(summary.balance)}`}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    summary.isBalanced
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {summary.isBalanced
                    ? "El asiento contable está balanceado"
                    : "El asiento debe cerrar en cero para confirmar"}
                </p>
              </div>
            </div>

            {!summary.isBalanced && summary.balance > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MinusCircleIcon className="size-3.5 shrink-0" />
                <span>
                  Falta agregar{" "}
                  <strong>{currencyFormatter.format(summary.balance)}</strong>{" "}
                  en métodos de pago
                </span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={
                !summary.isBalanced ||
                invoices.length === 0 ||
                methods.length === 0 ||
                isPending
              }
              onClick={handleSubmit}
            >
              {isPending ? "Confirmando..." : "Confirmar orden de pago"}
            </Button>

            {!summary.isBalanced && (
              <p className="text-xs text-center text-muted-foreground">
                El botón se habilita cuando la diferencia sea $0
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
