"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

const formSchema = z.object({
  invoice_email_from_name: z.string().trim().max(80, "Máximo 80 caracteres"),
  invoice_email_subject_template: z
    .string()
    .trim()
    .max(160, "Máximo 160 caracteres"),
  invoice_email_body_template: z
    .string()
    .trim()
    .max(2000, "Máximo 2000 caracteres"),
  invoice_email_attach_pdf: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const invoiceEmailBodyPlaceholder =
  "Hola {cliente},\n\nTe enviamos la factura electrónica {comprobante}, emitida por {organizacion}, correspondiente a la venta del {fecha} por {total}.\n\nSaludos";
const invoiceEmailVariablesDescription =
  "Variables disponibles: {cliente}, {organizacion}, {comprobante}, {numero_factura}, {fecha} y {total}.";

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
      invoice_email_subject_template: "",
      invoice_email_body_template: "",
      invoice_email_attach_pdf: true,
    },
  });

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          invoice_email_from_name: result.data.invoice_email_from_name ?? "",
          invoice_email_subject_template:
            result.data.invoice_email_subject_template ?? "",
          invoice_email_body_template:
            result.data.invoice_email_body_template ?? "",
          invoice_email_attach_pdf:
            result.data.invoice_email_attach_pdf ?? true,
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
          Emails de factura
        </CardTitle>
        <CardDescription>
          Configurá cómo salen los correos de facturas fiscales: remitente,
          asunto, contenido y adjuntos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 animate-pulse rounded-md bg-muted" />
        ) : (
          <Form {...form}>
            <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Remitente</h3>
                  <p className="text-muted-foreground text-sm">
                    Nombre que ve el cliente cuando recibe el correo.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="invoice_email_from_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del remitente</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ej: Administración Acme"
                        />
                      </FormControl>
                      <FormDescription>
                        Si lo dejás vacío, se usa el nombre de la organización.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Asunto y contenido</h3>
                  <p className="text-muted-foreground text-sm">
                    Plantilla base que se usa cada vez que se envía o reenvía
                    una factura por email.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="invoice_email_subject_template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asunto del correo</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Factura electrónica {comprobante}"
                        />
                      </FormControl>
                      <FormDescription>
                        Podés usar variables como {"{cliente}"},{" "}
                        {"{comprobante}"}, {"{fecha}"} y {"{total}"}.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoice_email_body_template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenido del correo</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-40"
                          placeholder={invoiceEmailBodyPlaceholder}
                        />
                      </FormControl>
                      <FormDescription>
                        {invoiceEmailVariablesDescription}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="invoice_email_attach_pdf"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="text-base">Adjuntos</FormLabel>
                      <FormDescription>
                        Adjuntar automáticamente el PDF fiscal de la factura al
                        enviar el correo.
                      </FormDescription>
                    </div>
                    <FormControl className="shrink-0">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
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
