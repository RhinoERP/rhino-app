"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
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
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

const formSchema = z.object({
  invoice_email_from_name: z.string().trim().max(80, "Máximo 80 caracteres"),
});

type FormValues = z.infer<typeof formSchema>;

type InvoiceEmailSettingsProps = {
  orgSlug: string;
};

export function InvoiceEmailSettings({ orgSlug }: InvoiceEmailSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invoice_email_from_name: "",
    },
  });

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          invoice_email_from_name: result.data.invoice_email_from_name ?? "",
        });
      }
      setIsLoading(false);
    });
  }, [form, orgSlug]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, values);
    setIsSaving(false);

    if (result.success) {
      toast.success("Configuración de email guardada");
      return;
    }

    toast.error(result.error ?? "No se pudo guardar");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <EnvelopeSimpleIcon className="size-5" weight="duotone" />
          Email de Factura
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
                name="invoice_email_from_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del remitente</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ej: Administración Acme" />
                    </FormControl>
                    <FormDescription>
                      Es el nombre que verá el cliente en el mail de la factura.
                      Si lo dejás vacío, se usa el nombre de la organización.
                    </FormDescription>
                    <FormMessage />
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
