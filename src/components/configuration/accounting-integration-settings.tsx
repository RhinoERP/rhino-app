"use client";

import { CalculatorIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

const EMPTY_OPTION = "__none__";

type FormValues = {
  automatic_accounting_enabled: boolean;
  pos_cash_account_code: string | null;
  pos_card_account_code: string | null;
  pos_transfer_account_code: string | null;
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
  const { data: cuentas = [] } = useCuentas(orgSlug);

  const accountOptions = useMemo(
    () =>
      cuentas
        .filter((cuenta) => Boolean(cuenta.account_code))
        .sort((a, b) =>
          (a.codigo ?? "").localeCompare(b.codigo ?? "", "es", {
            numeric: true,
          })
        ),
    [cuentas]
  );

  const form = useForm<FormValues>({
    defaultValues: {
      automatic_accounting_enabled: false,
      pos_cash_account_code: null,
      pos_card_account_code: null,
      pos_transfer_account_code: null,
    },
  });

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          automatic_accounting_enabled:
            result.data.automatic_accounting_enabled,
          pos_cash_account_code: result.data.pos_cash_account_code ?? null,
          pos_card_account_code: result.data.pos_card_account_code ?? null,
          pos_transfer_account_code:
            result.data.pos_transfer_account_code ??
            result.data.pos_electronic_account_code ??
            null,
        });
      }
      setIsLoading(false);
    });
  }, [orgSlug, form]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      automatic_accounting_enabled: values.automatic_accounting_enabled,
      pos_cash_account_code: values.pos_cash_account_code ?? null,
      pos_card_account_code: values.pos_card_account_code ?? null,
      pos_transfer_account_code: values.pos_transfer_account_code ?? null,
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
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
                <FormField
                  control={form.control}
                  name="pos_cash_account_code"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Cuenta de efectivo POS</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === EMPTY_OPTION ? null : value)
                        }
                        value={field.value ?? EMPTY_OPTION}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0 overflow-hidden">
                            <SelectValue
                              className="min-w-0 truncate"
                              placeholder="Seleccioná cuenta"
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={EMPTY_OPTION}>
                            Sin configurar
                          </SelectItem>
                          {accountOptions.map((cuenta) => (
                            <SelectItem
                              key={cuenta.account_code ?? cuenta.id}
                              value={cuenta.account_code ?? ""}
                            >
                              {cuenta.account_code} · {cuenta.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Cuenta contable para cobros en efectivo.
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pos_card_account_code"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Cuenta de tarjetas POS</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === EMPTY_OPTION ? null : value)
                        }
                        value={field.value ?? EMPTY_OPTION}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0 overflow-hidden">
                            <SelectValue
                              className="min-w-0 truncate"
                              placeholder="Seleccioná cuenta"
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={EMPTY_OPTION}>
                            Sin configurar
                          </SelectItem>
                          {accountOptions.map((cuenta) => (
                            <SelectItem
                              key={cuenta.account_code ?? cuenta.id}
                              value={cuenta.account_code ?? ""}
                            >
                              {cuenta.account_code} · {cuenta.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Se usa para tarjetas de crédito y débito.
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pos_transfer_account_code"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Cuenta de transferencias POS</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === EMPTY_OPTION ? null : value)
                        }
                        value={field.value ?? EMPTY_OPTION}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0 overflow-hidden">
                            <SelectValue
                              className="min-w-0 truncate"
                              placeholder="Seleccioná cuenta"
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={EMPTY_OPTION}>
                            Sin configurar
                          </SelectItem>
                          {accountOptions.map((cuenta) => (
                            <SelectItem
                              key={cuenta.account_code ?? cuenta.id}
                              value={cuenta.account_code ?? ""}
                            >
                              {cuenta.account_code} · {cuenta.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Se usa para transferencias y depósitos.
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>

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
