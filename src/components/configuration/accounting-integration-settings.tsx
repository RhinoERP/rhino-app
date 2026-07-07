"use client";

import { CalculatorIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

type FormValues = {
  accounting_integration_enabled: boolean;
  automatic_accounting_enabled: boolean;
};

type AccountingIntegrationSettingsProps = {
  orgSlug: string;
};

export function AccountingIntegrationSettings({
  orgSlug,
}: AccountingIntegrationSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    defaultValues: {
      accounting_integration_enabled: false,
      automatic_accounting_enabled: false,
    },
  });

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          accounting_integration_enabled:
            result.data.accounting_integration_enabled,
          automatic_accounting_enabled:
            result.data.automatic_accounting_enabled,
        });
      }
      setIsLoading(false);
    });
  }, [orgSlug, form]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      accounting_integration_enabled: values.accounting_integration_enabled,
      automatic_accounting_enabled: values.automatic_accounting_enabled,
    });
    setIsSaving(false);

    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "settings"] });
      toast.success("Configuración guardada");
      return;
    }

    toast.error(result.error ?? "No se pudo guardar");
  }

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalculatorIcon className="size-5" weight="duotone" />
            Integración contable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="accounting_integration_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="text-base">
                        Habilitar integración contable
                      </FormLabel>
                      <FormDescription>
                        Cuando está activa, ventas, compras, cobranzas y notas
                        de crédito pueden generar y formalizar asientos
                        vinculados al módulo contable.
                      </FormDescription>
                    </div>
                    <FormControl className="shrink-0">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="automatic_accounting_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="text-base">
                        Contabilidad automática
                      </FormLabel>
                      <FormDescription>
                        Cuando está activa, las transacciones integradas generan
                        el asiento contable automáticamente si la regla queda
                        completa. Cuando la regla requiere selección de cuentas,
                        se abre la revisión manual de todas formas.
                      </FormDescription>
                    </div>
                    <FormControl className="shrink-0">
                      <Switch
                        checked={field.value}
                        disabled={!form.watch("accounting_integration_enabled")}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">Asientos por categoría</p>
                <p className="mt-1 text-muted-foreground">
                  La cuenta contable de cada categoría se configura desde{" "}
                  <Link
                    className="underline underline-offset-4"
                    href={`/org/${orgSlug}/configuracion/categorias`}
                  >
                    Categorías
                  </Link>
                  .
                </p>
              </div>

              <div className="flex justify-end">
                <Button disabled={isSaving} type="submit">
                  {isSaving ? "Guardando..." : "Guardar configuración"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
