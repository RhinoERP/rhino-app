"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CurrencyCircleDollarIcon,
  PercentIcon,
  ShoppingCartSimpleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { updateDirectSaleConfigAction } from "@/modules/organizations/actions/update-direct-sale-config.action";
import type { DirectSaleConfig } from "@/modules/organizations/types";
import { taxesClientQueryOptions } from "@/modules/taxes/queries/queries.client";

const NO_TAX_VALUE = "__none__";
const paymentMethods = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_de_credito", label: "Tarjeta de crédito" },
  { value: "tarjeta_de_debito", label: "Tarjeta de débito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "deposito", label: "Depósito" },
  { value: "e-cheq", label: "E-Cheq" },
] as const;

const directSaleConfigFormSchema = z.object({
  directSaleTaxId: z.union([z.string().uuid(), z.literal(NO_TAX_VALUE)]),
  directSaleMarkupPercentage: z
    .string()
    .min(1, "El recargo es obligatorio")
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 500;
    }, "El recargo debe estar entre 0% y 500%"),
  salesEnabledPaymentMethods: z.array(
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
  salesDefaultPaymentMethod: z.enum([
    "efectivo",
    "tarjeta_de_credito",
    "tarjeta_de_debito",
    "transferencia",
    "cheque",
    "deposito",
    "e-cheq",
  ]),
});

type DirectSaleConfigFormValues = z.infer<typeof directSaleConfigFormSchema>;

type DirectSaleConfigFormProps = {
  orgSlug: string;
  initialConfig: DirectSaleConfig;
};

export function DirectSaleConfigForm({
  orgSlug,
  initialConfig,
}: DirectSaleConfigFormProps) {
  const { data: taxes = [], isLoading: isLoadingTaxes } = useQuery(
    taxesClientQueryOptions(orgSlug)
  );

  const form = useForm<DirectSaleConfigFormValues>({
    resolver: zodResolver(directSaleConfigFormSchema),
    defaultValues: {
      directSaleTaxId: initialConfig.direct_sale_tax_id ?? NO_TAX_VALUE,
      directSaleMarkupPercentage: String(
        initialConfig.direct_sale_markup_percentage ?? 0
      ),
      salesEnabledPaymentMethods:
        initialConfig.sales_enabled_payment_methods ?? [],
      salesDefaultPaymentMethod:
        initialConfig.sales_default_payment_method ?? "efectivo",
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (values: DirectSaleConfigFormValues) => {
      const result = await updateDirectSaleConfigAction(orgSlug, {
        directSaleTaxId:
          values.directSaleTaxId === NO_TAX_VALUE
            ? null
            : values.directSaleTaxId,
        directSaleTaxIds: initialConfig.direct_sale_tax_ids ?? [],
        directSaleMarkupPercentage: Number(values.directSaleMarkupPercentage),
        salesEnabledPaymentMethods: values.salesEnabledPaymentMethods,
        salesDefaultPaymentMethod: values.salesDefaultPaymentMethod,
        salesDefaultInvoiceType:
          initialConfig.sales_default_invoice_type ?? "NOTA_DE_VENTA",
      });

      if (!result.success) {
        throw new Error(result.error ?? "No se pudo guardar la configuración");
      }

      return result.data;
    },
    onSuccess: (data) => {
      toast.success("Configuración de venta directa guardada");
      if (data) {
        form.reset({
          directSaleTaxId: data.direct_sale_tax_id ?? NO_TAX_VALUE,
          directSaleMarkupPercentage: String(
            data.direct_sale_markup_percentage ?? 0
          ),
          salesEnabledPaymentMethods: data.sales_enabled_payment_methods ?? [],
          salesDefaultPaymentMethod:
            data.sales_default_payment_method ?? "efectivo",
        });
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración"
      );
    },
  });

  const watchedTaxId = form.watch("directSaleTaxId");
  const markupPercentage = Number(form.watch("directSaleMarkupPercentage"));
  const previewMultiplier =
    Number.isFinite(markupPercentage) && markupPercentage > 0
      ? 1 + markupPercentage / 100
      : 1;
  const enabledMethods = form.watch("salesEnabledPaymentMethods");
  const defaultPaymentMethod = form.watch("salesDefaultPaymentMethod");
  const enabledMethodOptions = useMemo(() => {
    if (enabledMethods.length === 0) {
      return paymentMethods;
    }

    return paymentMethods.filter((method) =>
      enabledMethods.includes(method.value)
    );
  }, [enabledMethods]);
  const selectedTax = useMemo(
    () =>
      watchedTaxId === NO_TAX_VALUE
        ? null
        : (taxes.find((tax) => tax.id === watchedTaxId) ?? null),
    [taxes, watchedTaxId]
  );

  useEffect(() => {
    if (
      enabledMethods.length === 0 ||
      enabledMethods.includes(defaultPaymentMethod)
    ) {
      return;
    }

    form.setValue("salesDefaultPaymentMethod", enabledMethods[0], {
      shouldDirty: true,
    });
  }, [defaultPaymentMethod, enabledMethods, form]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShoppingCartSimpleIcon className="size-5" weight="duotone" />
              Parámetros de venta directa
            </CardTitle>
            <CardDescription>
              Define el impuesto inicial y el recargo automático para ventas a
              consumidor final.
            </CardDescription>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Recargo actual</span>
            <p className="font-medium">
              {initialConfig.direct_sale_markup_percentage ?? 0}%
            </p>
          </div>
        </div>
      </CardHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => updateConfig.mutate(values))}
        >
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormField
                control={form.control}
                name="directSaleTaxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impuesto favorito</FormLabel>
                    <Select
                      disabled={isLoadingTaxes}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona un impuesto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_TAX_VALUE}>
                          Sin impuesto predeterminado
                        </SelectItem>
                        {taxes.map((tax) => (
                          <SelectItem key={tax.id} value={tax.id}>
                            {tax.name} ({tax.rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Se aplicará como impuesto seleccionado por defecto al
                      abrir una nueva venta directa.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="directSaleMarkupPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porcentaje de recargo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <PercentIcon
                          className="absolute top-2.5 left-3 size-4 text-muted-foreground"
                          weight="duotone"
                        />
                        <Input
                          className="pl-9"
                          inputMode="decimal"
                          max="500"
                          min="0"
                          step="0.01"
                          type="number"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Se suma al precio de los productos cuando la venta es para
                      consumidor final.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="salesEnabledPaymentMethods"
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
                                      (value) => value !== method.value
                                    )
                                  : [...field.value, method.value]
                              );
                            }}
                            type="button"
                          >
                            <span>{method.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <FormDescription>
                      Define qué métodos querés habilitar en venta directa.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="salesDefaultPaymentMethod"
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
                    <FormDescription>
                      Se selecciona automáticamente al iniciar una venta
                      directa.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <CurrencyCircleDollarIcon
                    className="size-4 text-primary"
                    weight="duotone"
                  />
                  Vista previa
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Precio base</span>
                    <span className="font-medium">$100,00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Consumidor final
                    </span>
                    <span className="font-medium">
                      ${(100 * previewMultiplier).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className={cn("rounded-lg border p-4 text-sm")}>
                <p className="font-medium">Impuesto configurado</p>
                <p className="mt-1 text-muted-foreground">
                  {selectedTax
                    ? `${selectedTax.name} (${selectedTax.rate}%)`
                    : "No hay impuesto predeterminado."}
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button
              disabled={!form.formState.isDirty || updateConfig.isPending}
              onClick={() => form.reset()}
              type="button"
              variant="outline"
            >
              Descartar
            </Button>
            <Button disabled={updateConfig.isPending} type="submit">
              {updateConfig.isPending
                ? "Guardando..."
                : "Guardar configuración"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
