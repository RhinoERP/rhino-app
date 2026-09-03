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
  WHATSAPP_INTEGRATION_STATUSES,
  type WhatsAppIntegration,
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
    businessHours: integration?.businessHours ?? {},
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
          Definí el número y las reglas comerciales. La conexión con Meta se
          habilita en la siguiente fase; esta pantalla no guarda credenciales.
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
