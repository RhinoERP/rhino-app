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
import type {
  BulkPaymentDistribution,
  BulkPaymentInput,
  PaymentMethod,
} from "@/modules/collections/types";
import { BulkPaymentPreview } from "./bulk-payment-preview";

const formSchema = z.object({
  customerId: z.string().min(1, "Selecciona un cliente"),
  totalAmount: z.number().positive("El monto debe ser mayor a cero"),
  paymentMethod: z.enum([
    "efectivo",
    "transferencia",
    "cheque",
    "tarjeta_de_credito",
    "tarjeta_de_debito",
  ] as const),
  paymentDate: z.date(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type BulkPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  customers: Array<{ id: string; name: string }>;
  preselectedCustomerId?: string;
};

export function BulkPaymentDialog({
  open,
  onOpenChange,
  orgSlug,
  customers,
  preselectedCustomerId,
}: BulkPaymentDialogProps) {
  const [showPreview, setShowPreview] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: preselectedCustomerId ?? "",
      totalAmount: 0,
      paymentMethod: "efectivo",
      paymentDate: new Date(),
      referenceNumber: "",
      notes: "",
    },
  });

  const customerId = form.watch("customerId");
  const totalAmount = form.watch("totalAmount");

  // Reset preselected customer when dialog opens
  useEffect(() => {
    if (open && preselectedCustomerId) {
      form.setValue("customerId", preselectedCustomerId);
    }
  }, [open, preselectedCustomerId, form]);

  // Fetch distribution preview
  const { data: preview, isLoading: isLoadingPreview } = useQuery<
    BulkPaymentDistribution[]
  >({
    queryKey: ["bulk-payment-preview", orgSlug, customerId, totalAmount],
    queryFn: async () => {
      if (!customerId || totalAmount <= 0) {
        return [];
      }

      const response = await fetch(
        `/api/collections/bulk-payment-preview?orgSlug=${orgSlug}&customerId=${customerId}&totalAmount=${totalAmount}`
      );

      if (!response.ok) {
        throw new Error("Error al calcular distribución");
      }

      return response.json();
    },
    enabled: Boolean(customerId && totalAmount > 0),
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const input: BulkPaymentInput = {
        orgSlug,
        customerId: values.customerId,
        totalAmount: values.totalAmount,
        paymentMethod: values.paymentMethod as PaymentMethod,
        paymentDate: format(values.paymentDate, "yyyy-MM-dd"),
        referenceNumber: values.referenceNumber,
        notes: values.notes,
      };

      const response = await fetch("/api/collections/bulk-payment", {
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credit"] });

      const creditMessage =
        result.creditBalance > 0
          ? ` Se generó un saldo a favor de $${result.creditBalance.toFixed(2)}.`
          : "";

      toast.success(
        `Pago masivo procesado exitosamente. ${result.affectedAccounts} facturas actualizadas.${creditMessage}`
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
          <DialogTitle>Pago Masivo / Pago a Cuenta</DialogTitle>
          <DialogDescription>
            Registra un pago que se distribuirá automáticamente entre las
            facturas pendientes del cliente (primero las más antiguas).
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
                    El monto se aplicará a las siguientes facturas en orden de
                    vencimiento:
                  </p>
                </div>

                <BulkPaymentPreview
                  isLoading={isLoadingPreview}
                  preview={preview}
                  totalAmount={totalAmount}
                />
              </div>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un cliente" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto Total Recibido</FormLabel>
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
                          value={field.value ? field.value : ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Monto total que se distribuirá entre las facturas
                        pendientes
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
                        <Input placeholder="Ej: Cheque #1234" {...field} />
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
