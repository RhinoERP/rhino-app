"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createChequeEmitidoAction } from "@/modules/treasury/actions/checks.action";
import { useCuentasBancarias } from "@/modules/treasury/queries/queries.client";
import { BulkSupplierPaymentPreview } from "./bulk-supplier-payment-preview";

type BulkSupplierPaymentDistribution = {
  accountId: string;
  purchaseNumber: number | null;
  dueDate: string;
  totalAmount: number;
  pendingBalance: number;
  appliedAmount: number;
  newBalance: number;
  newStatus: "PENDING" | "PARTIAL" | "PAID";
};

const formSchema = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  totalAmount: z.number().positive("El monto debe ser mayor a cero"),
  paymentMethod: z.enum([
    "efectivo",
    "transferencia",
    "cheque",
    "e-cheq",
    "tarjeta_de_credito",
    "tarjeta_de_debito",
  ] as const),
  paymentDate: z.date(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  chequeCuentaBancariaId: z.string().optional(),
  chequeNumero: z.string().optional(),
  chequeFechaEmision: z.string().optional(),
  chequeFechaDebito: z.string().optional(),
  chequeBeneficiario: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type BulkSupplierPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId?: string;
  suppliers: Array<{ id: string; name: string }>;
  preselectedSupplierId?: string;
};

export function BulkSupplierPaymentDialog({
  open,
  onOpenChange,
  orgSlug,
  orgId,
  suppliers,
  preselectedSupplierId,
}: BulkSupplierPaymentDialogProps) {
  const [showPreview, setShowPreview] = useState(false);
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0] ?? "";

  const { data: cuentasBancarias = [] } = useCuentasBancarias(orgId ?? "", {
    soloActivas: true,
    enabled: open && !!orgId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierId: preselectedSupplierId ?? "",
      totalAmount: 0,
      paymentMethod: "efectivo",
      paymentDate: new Date(),
      referenceNumber: "",
      notes: "",
      chequeCuentaBancariaId: "",
      chequeNumero: "",
      chequeFechaEmision: today,
      chequeFechaDebito: today,
      chequeBeneficiario: "",
    },
  });

  const supplierId = form.watch("supplierId");
  const totalAmount = form.watch("totalAmount");
  const paymentMethod = form.watch("paymentMethod");
  const showChequeFields =
    paymentMethod === "cheque" || paymentMethod === "e-cheq";

  const selectedSupplierName =
    suppliers.find((s) => s.id === supplierId)?.name ?? "";

  // Reset preselected supplier when dialog opens
  useEffect(() => {
    if (open && preselectedSupplierId) {
      form.setValue("supplierId", preselectedSupplierId);
    }
  }, [open, preselectedSupplierId, form]);

  // Fetch available supplier credit
  const { data: creditBalance } = useQuery<number>({
    queryKey: ["supplier-credit-balance", orgSlug, supplierId],
    queryFn: async () => {
      if (!supplierId) {
        return 0;
      }

      const response = await fetch(
        `/api/purchases/supplier-credit-balance?orgSlug=${orgSlug}&supplierId=${supplierId}`
      );

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      return data.balance ?? 0;
    },
    enabled: Boolean(supplierId),
  });

  // Fetch distribution preview
  const { data: preview, isLoading: isLoadingPreview } = useQuery<
    BulkSupplierPaymentDistribution[]
  >({
    queryKey: [
      "bulk-supplier-payment-preview",
      orgSlug,
      supplierId,
      totalAmount,
    ],
    queryFn: async () => {
      if (!supplierId || totalAmount <= 0) {
        return [];
      }

      const response = await fetch(
        `/api/purchases/bulk-payment-preview?orgSlug=${orgSlug}&supplierId=${supplierId}&totalAmount=${totalAmount}`
      );

      if (!response.ok) {
        throw new Error("Error al calcular distribución");
      }

      return response.json();
    },
    enabled: Boolean(supplierId && totalAmount > 0),
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const input = {
        orgSlug,
        supplierId: values.supplierId,
        totalAmount: values.totalAmount,
        paymentMethod: values.paymentMethod,
        paymentDate: format(values.paymentDate, "yyyy-MM-dd"),
        referenceNumber: values.referenceNumber,
        notes: values.notes,
      };

      const response = await fetch("/api/purchases/bulk-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message ?? "Error al procesar el pago");
      }

      return response.json();
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payables"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credit-balance"] });

      // Fire-and-forget issued check if paid by cheque/e-cheq
      if (
        (variables.paymentMethod === "cheque" ||
          variables.paymentMethod === "e-cheq") &&
        variables.chequeCuentaBancariaId &&
        variables.chequeNumero
      ) {
        createChequeEmitidoAction(orgSlug, {
          cuentaBancariaId: variables.chequeCuentaBancariaId,
          numeroCheque: variables.chequeNumero,
          importe: String(variables.totalAmount),
          fechaEmision:
            variables.chequeFechaEmision ??
            new Date().toISOString().split("T")[0] ??
            "",
          fechaDebito:
            variables.chequeFechaDebito ??
            new Date().toISOString().split("T")[0] ??
            "",
          beneficiario: variables.chequeBeneficiario || selectedSupplierName,
          beneficiarioId: variables.supplierId,
          tipo: variables.paymentMethod === "e-cheq" ? "ECH" : "CDF",
        }).catch((err: unknown) => {
          console.error(
            "No se pudo registrar cheque emitido en Tesorería:",
            err
          );
        });
      }

      const creditMessage =
        result.creditBalance > 0
          ? ` Se generó un crédito con el proveedor de $${result.creditBalance.toFixed(2)}.`
          : "";

      toast.success(
        `Pago masivo procesado exitosamente. ${result.affectedAccounts} órdenes de compra actualizadas.${creditMessage}`
      );

      onOpenChange(false);
      form.reset();
      setShowPreview(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Error al procesar el pago"
      );
    },
  });

  const handleSubmit = (values: FormValues) => {
    if (!showPreview) {
      setShowPreview(true);
      return;
    }
    mutation.mutate(values);
  };

  const getButtonText = () => {
    if (mutation.isPending) {
      return (
        <>
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Procesando...
        </>
      );
    }
    return showPreview ? "Confirmar Pago" : "Ver Distribución";
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pago Masivo a Proveedor</DialogTitle>
          <DialogDescription>
            Registra un pago que se distribuirá automáticamente entre las
            órdenes de compra pendientes del proveedor (primero las más
            antiguas).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            {showPreview ? (
              <div className="space-y-4">
                <div className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-semibold">
                    Vista Previa de Distribución
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    El monto se aplicará a las siguientes órdenes de compra en
                    orden de vencimiento:
                  </p>
                </div>

                <BulkSupplierPaymentPreview
                  isLoading={isLoadingPreview}
                  preview={preview}
                  totalAmount={totalAmount}
                />
              </div>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proveedor</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un proveedor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {supplierId &&
                  creditBalance !== undefined &&
                  creditBalance > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="font-medium text-blue-900 text-sm">
                        Crédito disponible con este proveedor:{" "}
                        <span className="font-bold">
                          ${creditBalance.toFixed(2)}
                        </span>
                      </p>
                      <p className="mt-1 text-blue-700 text-xs">
                        Este crédito puede aplicarse a futuras compras
                      </p>
                    </div>
                  )}

                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto Total Pagado</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0.00"
                          step="0.01"
                          type="number"
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value
                              ? Number.parseFloat(e.target.value)
                              : 0;
                            field.onChange(value);
                          }}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Monto total que se distribuirá entre las órdenes de
                        compra pendientes
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de Pago</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="efectivo">Efectivo</SelectItem>
                          <SelectItem value="transferencia">
                            Transferencia
                          </SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="e-cheq">E-Cheq</SelectItem>
                          <SelectItem value="tarjeta_de_credito">
                            Tarjeta de Crédito
                          </SelectItem>
                          <SelectItem value="tarjeta_de_debito">
                            Tarjeta de Débito
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Datos del cheque propio — solo para cheque/e-cheq */}
                {showChequeFields && (
                  <div className="space-y-3 rounded-md border p-3">
                    <p className="font-medium text-sm">
                      Datos del cheque propio
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="chequeNumero"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>N° de cheque</FormLabel>
                            <FormControl>
                              <Input placeholder="00001234" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="chequeBeneficiario"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Beneficiario</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={selectedSupplierName}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="chequeFechaEmision"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha emisión</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="chequeFechaDebito"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha débito/vencimiento</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="chequeCuentaBancariaId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cuenta bancaria propia</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona una cuenta" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cuentasBancarias.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nombre} — {c.banco}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="paymentDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Fecha de Pago</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              variant="outline"
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: es })
                              ) : (
                                <span>Selecciona una fecha</span>
                              )}
                              <CalendarIcon className="ml-auto size-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                            locale={es}
                            mode="single"
                            onSelect={field.onChange}
                            selected={field.value}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Referencia (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Transferencia #1234"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Notas adicionales sobre el pago"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="flex justify-end gap-2">
              {showPreview && (
                <Button
                  disabled={mutation.isPending}
                  onClick={() => setShowPreview(false)}
                  type="button"
                  variant="outline"
                >
                  Volver
                </Button>
              )}
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                  setShowPreview(false);
                }}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  mutation.isPending ||
                  (showPreview && (!preview || preview.length === 0))
                }
                type="submit"
              >
                {getButtonText()}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
