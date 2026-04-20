"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarCheckIcon } from "@phosphor-icons/react";
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
import { Switch } from "@/components/ui/switch";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

const formSchema = z.object({
  due_days_enabled: z.boolean(),
  due_days_default: z.number().int().min(1, "Mínimo 1 día"),
});

type FormValues = z.infer<typeof formSchema>;

type DueDaysSettingsProps = {
  orgSlug: string;
};

export function DueDaysSettings({ orgSlug }: DueDaysSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      due_days_enabled: false,
      due_days_default: 30,
    },
  });

  const dueDaysEnabled = form.watch("due_days_enabled");

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        form.reset({
          due_days_enabled: result.data.due_days_enabled,
          due_days_default: result.data.due_days_default,
        });
      }
      setIsLoading(false);
    });
  }, [orgSlug, form]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      due_days_enabled: values.due_days_enabled,
      due_days_default: values.due_days_default,
    });
    setIsSaving(false);

    if (result.success) {
      toast.success("Configuración guardada");
    } else {
      toast.error(result.error ?? "Error al guardar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarCheckIcon className="size-5" weight="duotone" />
          Vencimiento de documentos
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
                name="due_days_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="text-base">
                        Vencimiento automático
                      </FormLabel>
                      <FormDescription>
                        Pre-completa la fecha de vencimiento al crear o editar
                        una venta según los días configurados
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

              {dueDaysEnabled && (
                <FormField
                  control={form.control}
                  name="due_days_default"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Días de vencimiento por defecto</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="w-32"
                          min={1}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? 1 : Number(e.target.value)
                            )
                          }
                          type="number"
                          value={field.value}
                        />
                      </FormControl>
                      <FormDescription>
                        Se usa si el cliente no tiene días de vencimiento
                        configurados.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
