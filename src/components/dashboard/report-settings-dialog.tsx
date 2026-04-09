/**
 * Report Settings Dialog
 * Configuration dialog for monthly email reports
 */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getOrganizationReportSettings } from "@/modules/organizations/actions/get-report-settings.action";
import { updateOrganizationReportSettings } from "@/modules/organizations/actions/update-report-settings.action";

const formSchema = z.object({
  monthlyReportEnabled: z.boolean(),
  monthlyReportDayOfWeek: z.number().min(1).max(7).nullable(),
  weeklyReportEnabled: z.boolean(),
  weeklyReportDayOfWeek: z.number().min(1).max(7).nullable(),
});

type FormValues = z.infer<typeof formSchema>;

type ReportSettingsDialogProps = {
  orgSlug: string;
};

const DAY_NAMES: Record<string, string> = {
  "1": "Lunes",
  "2": "Martes",
  "3": "Miércoles",
  "4": "Jueves",
  "5": "Viernes",
  "6": "Sábado",
  "7": "Domingo",
};

const DAYS_OF_WEEK = [
  { value: "1", label: "Lunes de la primera semana" },
  { value: "2", label: "Martes de la primera semana" },
  { value: "3", label: "Miércoles de la primera semana" },
  { value: "4", label: "Jueves de la primera semana" },
  { value: "5", label: "Viernes de la primera semana" },
  { value: "6", label: "Sábado de la primera semana" },
  { value: "7", label: "Domingo de la primera semana" },
];

export function ReportSettingsDialog({ orgSlug }: ReportSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      monthlyReportEnabled: false,
      monthlyReportDayOfWeek: null,
      weeklyReportEnabled: false,
      weeklyReportDayOfWeek: null,
    },
  });

  const monthlyReportEnabled = form.watch("monthlyReportEnabled");
  const weeklyReportEnabled = form.watch("weeklyReportEnabled");

  // Load current settings when dialog opens
  useEffect(() => {
    if (open) {
      const loadSettings = async () => {
        const result = await getOrganizationReportSettings(orgSlug);
        if (result.success && result.data) {
          form.reset({
            monthlyReportEnabled: result.data.monthlyReportEnabled,
            monthlyReportDayOfWeek: result.data.monthlyReportDayOfWeek,
            weeklyReportEnabled: result.data.weeklyReportEnabled,
            weeklyReportDayOfWeek: result.data.weeklyReportDayOfWeek,
          });
        }
      };
      loadSettings().catch((error) => {
        console.error("Error loading settings:", error);
      });
    }
  }, [open, orgSlug, form]);

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);

    try {
      const result = await updateOrganizationReportSettings(orgSlug, {
        monthlyReportEnabled: values.monthlyReportEnabled,
        monthlyReportDayOfWeek: values.monthlyReportDayOfWeek,
        weeklyReportEnabled: values.weeklyReportEnabled,
        weeklyReportDayOfWeek: values.weeklyReportDayOfWeek,
      });

      if (result.success) {
        toast.success("Configuración guardada exitosamente");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Error al guardar la configuración");
      }
    } catch (error) {
      console.error("Error saving report settings:", error);
      toast.error("Error inesperado al guardar la configuración");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="h-9" size="sm" variant="outline">
          <Mail className="mr-2 size-4" />
          Configurar Reporte
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configurar Reportes</DialogTitle>
          <DialogDescription>
            Recibe resúmenes ejecutivos de la Torre de Control por correo
            electrónico.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="monthlyReportEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Habilitar reporte mensual
                    </FormLabel>
                    <FormDescription>
                      Recibe automáticamente un resumen de métricas clave cada
                      mes
                    </FormDescription>
                  </div>
                  <FormControl>
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
              name="monthlyReportDayOfWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Día de envío</FormLabel>
                  <Select
                    disabled={!monthlyReportEnabled}
                    onValueChange={(value) => field.onChange(Number(value))}
                    value={field.value?.toString() ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un día" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    El reporte se enviará automáticamente durante la primera
                    semana de cada mes
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-6">
              <FormField
                control={form.control}
                name="weeklyReportEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Habilitar reporte semanal
                      </FormLabel>
                      <FormDescription>
                        Recibe automáticamente un resumen de métricas clave cada
                        semana
                      </FormDescription>
                    </div>
                    <FormControl>
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
                name="weeklyReportDayOfWeek"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Día de envío</FormLabel>
                    <Select
                      disabled={!weeklyReportEnabled}
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={field.value?.toString() ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un día" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {DAY_NAMES[day.value] ?? day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      El reporte se enviará todos los [día] con el resumen de la
                      semana anterior
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                disabled={isLoading}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isLoading} type="submit">
                {isLoading ? "Guardando..." : "Guardar configuración"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
