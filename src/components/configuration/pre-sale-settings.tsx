"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, FileTextIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";
import { INVOICE_TYPE_OPTIONS } from "@/modules/sales/invoice-type-utils";
import type { InvoiceType } from "@/modules/sales/types";
import { useTaxes } from "@/modules/taxes/hooks/use-taxes";

const paymentMethods = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_de_credito", label: "Tarjeta de crédito" },
  { value: "tarjeta_de_debito", label: "Tarjeta de débito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "deposito", label: "Depósito" },
  { value: "e-cheq", label: "E-Cheq" },
] as const;

const invoiceTypes: { value: InvoiceType; label: string }[] =
  INVOICE_TYPE_OPTIONS;

const formSchema = z.object({
  sales_default_tax_ids: z.array(z.string().uuid()),
  sales_enabled_payment_methods: z.array(
    z.enum([
      "efectivo",
      "tarjeta_de_credito",
      "tarjeta_de_debito",
      "transferencia",
      "cheque",
      "deposito",
      "e-cheq",
    ])
  ),
  sales_default_payment_method: z.enum([
    "efectivo",
    "tarjeta_de_credito",
    "tarjeta_de_debito",
    "transferencia",
    "cheque",
    "deposito",
    "e-cheq",
  ]),
  sales_default_invoice_type: z.enum([
    "NOTA_DE_VENTA",
    "FACTURA_A",
    "FACTURA_A_RETENCION",
    "FACTURA_B",
    "FACTURA_C",
    "FACTURA_E",
  ]),
});

type FormValues = z.infer<typeof formSchema>;

type PreSaleSettingsProps = {
  orgSlug: string;
};

export function PreSaleSettings({ orgSlug }: PreSaleSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { data: taxes = [] } = useTaxes(orgSlug);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sales_default_tax_ids: [],
      sales_enabled_payment_methods: [],
      sales_default_payment_method: "efectivo",
      sales_default_invoice_type: "NOTA_DE_VENTA",
    },
  });

  const enabledMethods = form.watch("sales_enabled_payment_methods");
  const defaultMethod = form.watch("sales_default_payment_method");

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          sales_default_tax_ids: result.data.sales_default_tax_ids ?? [],
          sales_enabled_payment_methods:
            result.data.sales_enabled_payment_methods ?? [],
          sales_default_payment_method:
            result.data.sales_default_payment_method ?? "efectivo",
          sales_default_invoice_type:
            result.data.sales_default_invoice_type ?? "NOTA_DE_VENTA",
        });
      }
      setIsLoading(false);
    });
  }, [orgSlug, form]);

  useEffect(() => {
    if (enabledMethods.length === 0 || enabledMethods.includes(defaultMethod)) {
      return;
    }
    form.setValue("sales_default_payment_method", enabledMethods[0], {
      shouldDirty: true,
    });
  }, [defaultMethod, enabledMethods, form]);

  const enabledMethodOptions = useMemo(() => {
    if (enabledMethods.length === 0) {
      return paymentMethods;
    }
    return paymentMethods.filter((method) =>
      enabledMethods.includes(method.value)
    );
  }, [enabledMethods]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, values);
    setIsSaving(false);

    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "settings"] });
      toast.success("Configuración de preventa guardada");
      return;
    }

    toast.error(result.error ?? "No se pudo guardar");
  }

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileTextIcon className="size-5" />
          Preventa
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="sales_default_tax_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Impuestos predeterminados</FormLabel>
                  <div className="grid gap-2 md:grid-cols-2">
                    {taxes.map((tax) => {
                      const selected = field.value.includes(tax.id);
                      return (
                        <button
                          className={cn(
                            "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                            selected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/40"
                          )}
                          key={tax.id}
                          onClick={(event) => {
                            event.preventDefault();
                            field.onChange(
                              selected
                                ? field.value.filter((id) => id !== tax.id)
                                : [...field.value, tax.id]
                            );
                          }}
                          type="button"
                        >
                          <span>
                            {tax.name} ({tax.rate}%)
                          </span>
                          {selected ? (
                            <CheckIcon className="size-4 text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <FormDescription>
                    Se aplican por defecto al crear una preventa.
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sales_enabled_payment_methods"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Métodos de pago habilitados</FormLabel>
                  <div className="grid gap-2 md:grid-cols-2">
                    {paymentMethods.map((method) => {
                      const selected = field.value.includes(method.value);
                      return (
                        <button
                          className={cn(
                            "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                            selected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/40"
                          )}
                          key={method.value}
                          onClick={(event) => {
                            event.preventDefault();
                            field.onChange(
                              selected
                                ? field.value.filter(
                                    (id) => id !== method.value
                                  )
                                : [...field.value, method.value]
                            );
                          }}
                          type="button"
                        >
                          <span>{method.label}</span>
                          {selected ? (
                            <CheckIcon className="size-4 text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <FormDescription>
                    Define qué métodos querés habilitar para preventas.
                  </FormDescription>
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="sales_default_payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago predeterminado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona método" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {enabledMethodOptions.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
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
                name="sales_default_invoice_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de comprobante predeterminado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {invoiceTypes.map((invoice) => (
                          <SelectItem key={invoice.value} value={invoice.value}>
                            {invoice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
