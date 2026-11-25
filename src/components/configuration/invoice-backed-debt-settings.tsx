"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ReceiptIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

const schema = z.object({ invoice_backed_debt_enabled: z.boolean() });
type FormValues = z.infer<typeof schema>;

export function InvoiceBackedDebtSettings({ orgSlug }: { orgSlug: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { invoice_backed_debt_enabled: false },
  });

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getOrganizationSettings(orgSlug)
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.success && result.data) {
          form.reset({
            invoice_backed_debt_enabled:
              result.data.invoice_backed_debt_enabled,
          });
          setLoadFailed(false);
        } else {
          setLoadFailed(true);
          toast.error(result.error ?? "No se pudo cargar la política de deuda");
        }
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
          toast.error("No se pudo cargar la política de deuda");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [orgSlug, form]);

  async function onSubmit(values: FormValues) {
    try {
      const result = await updateOrganizationSettings(orgSlug, values);
      if (!result.success) {
        toast.error(result.error ?? "No se pudo guardar la política de deuda");
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["org", orgSlug, "settings"],
      });
      toast.success("Política de deuda guardada");
    } catch {
      toast.error("No se pudo guardar la política de deuda");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ReceiptIcon className="size-5" weight="duotone" />
          Generación de deuda de clientes y proveedores
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
                name="invoice_backed_debt_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div>
                      <FormLabel>Generar deuda solo contra factura</FormLabel>
                      <FormDescription>
                        Las ventas fiscales generan deuda al autorizar la
                        factura y las compras al registrar la factura del
                        proveedor. Las notas de venta y sus anticipos informales
                        mantienen la generación habitual de deuda sin factura.
                        Las deudas existentes se conservan.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        disabled={loadFailed || form.formState.isSubmitting}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  disabled={loadFailed || form.formState.isSubmitting}
                  type="submit"
                >
                  {form.formState.isSubmitting ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
