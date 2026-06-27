"use client";

import { ReceiptIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
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
  credit_note_accounting_modal_enabled: boolean;
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
      credit_note_accounting_modal_enabled: false,
    },
  });

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          accounting_integration_enabled:
            result.data.accounting_integration_enabled,
          credit_note_accounting_modal_enabled:
            result.data.credit_note_accounting_modal_enabled,
        });
      }
      setIsLoading(false);
    });
  }, [orgSlug, form]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      accounting_integration_enabled: values.accounting_integration_enabled,
      credit_note_accounting_modal_enabled:
        values.credit_note_accounting_modal_enabled,
    });
    setIsSaving(false);

    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "settings"] });
      toast.success("Configuración guardada");
      return;
    }

    toast.error(result.error ?? "Error al guardar");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ReceiptIcon className="size-5" weight="duotone" />
          Integración contable
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        ) : (
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
                        Cuando está activa, ventas, compras y notas de crédito
                        disparan sus flujos contables. Si está desactivada, los
                        flujos operativos continúan sin crear asientos ni
                        eventos contables.
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
                name="credit_note_accounting_modal_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="text-base">
                        Mostrar modal contable en notas de crédito
                      </FormLabel>
                      <FormDescription>
                        Cuando está activa, la creación de notas de crédito abre
                        el modal contable para revisar el asiento antes de
                        registrarlo. Si está desactivada, se registra
                        automáticamente.
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

              <div className="flex justify-end">
                <Button disabled={isSaving} type="submit">
                  {isSaving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
