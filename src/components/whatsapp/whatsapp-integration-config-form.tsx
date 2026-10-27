"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChatCircleTextIcon } from "@phosphor-icons/react";
import { useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveWhatsAppIntegrationAction } from "@/modules/whatsapp/actions/save-whatsapp-integration.action";
import type { WhatsAppIntegrationConfigurationInput } from "@/modules/whatsapp/schemas";
import {
  DEFAULT_WHATSAPP_BUSINESS_HOURS,
  DEFAULT_WHATSAPP_RESPONSE_DELAY,
  WHATSAPP_INTEGRATION_STATUSES,
  WHATSAPP_WEEKDAYS,
  type WhatsAppIntegration,
  type WhatsAppWeekday,
} from "@/modules/whatsapp/types";

const NONE = "__none__";

const formSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "El ID del número de Meta es obligatorio")
    .max(128),
  displayPhoneNumber: z.string().trim().max(64),
  status: z.enum(WHATSAPP_INTEGRATION_STATUSES),
  salesPriceListId: z.string(),
  responsibleUserId: z.string(),
  handoffMessage: z.string().trim().max(1000),
  businessHours: z.object({
    enabled: z.boolean(),
    timezone: z.string(),
    weeklySchedule: z.object(
      Object.fromEntries(
        WHATSAPP_WEEKDAYS.map((day) => [
          day,
          z.object({
            enabled: z.boolean(),
            start: z.string(),
            end: z.string(),
          }),
        ])
      ) as Record<
        WhatsAppWeekday,
        z.ZodObject<{
          enabled: z.ZodBoolean;
          start: z.ZodString;
          end: z.ZodString;
        }>
      >
    ),
  }),
  responseDelayMinMinutes: z.number().int().min(0).max(120),
  responseDelayMaxMinutes: z.number().int().min(0).max(120),
});

type FormValues = z.infer<typeof formSchema>;

type WhatsAppIntegrationConfigFormProps = {
  integration: WhatsAppIntegration | null;
  orgSlug: string;
  priceLists: { id: string; name: string }[];
  responsibleUsers: { id: string; label: string }[];
};

function toFormValues(integration: WhatsAppIntegration | null): FormValues {
  return {
    phoneNumberId: integration?.phoneNumberId ?? "",
    displayPhoneNumber: integration?.displayPhoneNumber ?? "",
    status: integration?.status ?? "DRAFT",
    salesPriceListId: integration?.salesPriceListId ?? NONE,
    responsibleUserId: integration?.responsibleUserId ?? NONE,
    handoffMessage: integration?.handoffMessage ?? "",
    businessHours:
      integration?.businessHours ?? DEFAULT_WHATSAPP_BUSINESS_HOURS,
    responseDelayMinMinutes:
      integration?.responseDelayMinMinutes ??
      DEFAULT_WHATSAPP_RESPONSE_DELAY.minMinutes,
    responseDelayMaxMinutes:
      integration?.responseDelayMaxMinutes ??
      DEFAULT_WHATSAPP_RESPONSE_DELAY.maxMinutes,
  };
}

function toIntegrationInput(
  values: FormValues,
  integration: WhatsAppIntegration | null
): WhatsAppIntegrationConfigurationInput {
  return {
    phoneNumberId: values.phoneNumberId,
    displayPhoneNumber: values.displayPhoneNumber || null,
    status: values.status,
    salesPriceListId:
      values.salesPriceListId === NONE ? null : values.salesPriceListId,
    responsibleUserId:
      values.responsibleUserId === NONE ? null : values.responsibleUserId,
    businessHours: values.businessHours,
    responseDelayMinMinutes: values.responseDelayMinMinutes,
    responseDelayMaxMinutes: values.responseDelayMaxMinutes,
    commercialRules: integration?.commercialRules ?? {},
    handoffMessage: values.handoffMessage || null,
  };
}

export function WhatsAppIntegrationConfigForm({
  integration,
  orgSlug,
  priceLists,
  responsibleUsers,
}: WhatsAppIntegrationConfigFormProps) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(integration),
  });
  const businessHoursEnabled = form.watch("businessHours.enabled");
  const weeklySchedule = form.watch("businessHours.weeklySchedule");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await saveWhatsAppIntegrationAction(orgSlug, {
        ...toIntegrationInput(values, integration),
      });

      if (!(result.success && result.data)) {
        toast.error(result.error ?? "No se pudo guardar la configuración");
        return;
      }

      form.reset(toFormValues(result.data));
      toast.success("Configuración de WhatsApp guardada");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ChatCircleTextIcon className="size-5" weight="duotone" />
          Asistente comercial por WhatsApp
        </CardTitle>
        <CardDescription>
          Definí el número y las reglas comerciales. Las credenciales de Meta se
          mantienen fuera de esta pantalla y nunca se exponen al navegador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="phoneNumberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID de número de Meta</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej.: 123456789012345" {...field} />
                    </FormControl>
                    <FormDescription>
                      Es el identificador técnico del número, no el token.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayPhoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número visible</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej.: +54 9 11 1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DRAFT">Borrador</SelectItem>
                        <SelectItem value="ACTIVE">Activa</SelectItem>
                        <SelectItem value="PAUSED">Pausada</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salesPriceListId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lista de precios</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná una lista" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin asignar</SelectItem>
                        {priceLists.map((priceList) => (
                          <SelectItem key={priceList.id} value={priceList.id}>
                            {priceList.name}
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
                name="responsibleUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor responsable</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná un vendedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin asignar</SelectItem>
                        {responsibleUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="handoffMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje de derivación humana</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Te conectamos con una persona del equipo comercial."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Se usará cuando el cliente pida atención humana o el bot no
                    pueda resolver la consulta.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <section className="space-y-4 rounded-lg border p-4">
              <div>
                <h2 className="font-medium">Horario de atención</h2>
                <p className="text-muted-foreground text-sm">
                  Fuera de este horario, los mensajes quedan en espera y el
                  agente responde cuando vuelva a abrir.
                </p>
              </div>
              <FormField
                control={form.control}
                name="businessHours.enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Input
                        checked={field.value}
                        className="size-4"
                        onChange={(event) =>
                          field.onChange(event.target.checked)
                        }
                        type="checkbox"
                      />
                    </FormControl>
                    <FormLabel>Respetar horario laboral</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessHours.timezone"
                render={({ field }) => (
                  <FormItem className="max-w-md">
                    <FormLabel>Zona horaria</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="America/Argentina/Buenos_Aires"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Usá una zona IANA para que apertura y cierre sigan la hora
                      local.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                {WHATSAPP_WEEKDAYS.map((day) => (
                  <BusinessHoursRow
                    day={day}
                    disabled={!businessHoursEnabled}
                    enabled={weeklySchedule[day].enabled}
                    form={form}
                    key={day}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-lg border p-4">
              <div>
                <h2 className="font-medium">Tiempo antes de responder</h2>
                <p className="text-muted-foreground text-sm">
                  Se elige una demora aleatoria dentro de este rango para cada
                  mensaje.
                </p>
              </div>
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="responseDelayMinMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mínimo (minutos)</FormLabel>
                      <FormControl>
                        <Input
                          max={120}
                          min={0}
                          type="number"
                          {...field}
                          onChange={(event) =>
                            field.onChange(event.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responseDelayMaxMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Máximo (minutos)</FormLabel>
                      <FormControl>
                        <Input
                          max={120}
                          min={0}
                          type="number"
                          {...field}
                          onChange={(event) =>
                            field.onChange(event.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <div className="flex justify-end">
              <Button disabled={isPending} type="submit">
                {isPending ? "Guardando..." : "Guardar configuración"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

const WEEKDAY_LABELS: Record<WhatsAppWeekday, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

function BusinessHoursRow({
  day,
  enabled,
  disabled,
  form,
}: {
  day: WhatsAppWeekday;
  enabled: boolean;
  disabled: boolean;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const startName = `businessHours.weeklySchedule.${day}.start` as const;
  const endName = `businessHours.weeklySchedule.${day}.end` as const;
  const enabledName = `businessHours.weeklySchedule.${day}.enabled` as const;

  return (
    <div className="grid items-center gap-3 rounded-md bg-muted/30 p-2 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr]">
      <FormField
        control={form.control}
        name={enabledName}
        render={({ field }) => (
          <FormItem className="flex items-center gap-2 space-y-0">
            <FormControl>
              <Input
                checked={field.value}
                className="size-4"
                disabled={disabled}
                onChange={(event) => field.onChange(event.target.checked)}
                type="checkbox"
              />
            </FormControl>
            <FormLabel>{WEEKDAY_LABELS[day]}</FormLabel>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={startName}
        render={({ field }) => (
          <FormItem className="flex items-center gap-2 space-y-0">
            <FormLabel className="text-muted-foreground text-xs">
              Abre
            </FormLabel>
            <FormControl>
              <Input disabled={disabled || !enabled} type="time" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={endName}
        render={({ field }) => (
          <FormItem className="flex items-center gap-2 space-y-0">
            <FormLabel className="text-muted-foreground text-xs">
              Cierra
            </FormLabel>
            <FormControl>
              <Input disabled={disabled || !enabled} type="time" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}
