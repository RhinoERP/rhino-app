"use client";

import { CalendarIcon, TruckIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { EventoFacturaCompra } from "@/modules/accounting/types";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import { usePurchaseOrderWithItems } from "@/modules/purchases/hooks/use-purchase-order-with-items";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";

const inTransitSchema = z.object({
  delivery_date: z.date({
    error: "La fecha de entrega es requerida",
  }),
  logistics: z.string().min(1, "La empresa de logística es requerida"),
});

type InTransitFormValues = z.infer<typeof inTransitSchema>;

type PurchaseInTransitDialogProps = {
  purchaseOrderId: string;
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountingPayload?: (
    payload: EventoFacturaCompra,
    informalEntryId: string
  ) => void;
};

export function PurchaseInTransitDialog({
  purchaseOrderId,
  orgSlug,
  open,
  onOpenChange,
  onAccountingPayload,
}: PurchaseInTransitDialogProps) {
  const updateStatus = useUpdatePurchaseStatus(orgSlug);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] =
    useState<EventoFacturaCompra | null>(null);
  const [pendingInformalEntryId, setPendingInformalEntryId] = useState<
    string | null
  >(null);
  const { data: orgSettings, isLoading: isOrgSettingsLoading } =
    useOrgSettings(orgSlug);
  const accountingIntegrationEnabled =
    orgSettings?.accounting_integration_enabled ?? false;

  const { data: purchaseOrder, isLoading } = usePurchaseOrderWithItems(
    orgSlug,
    open ? purchaseOrderId : null
  );

  const form = useForm<InTransitFormValues>({
    resolver: (values) => {
      const parsed = inTransitSchema.safeParse(values);
      if (parsed.success) {
        return { values: parsed.data, errors: {} };
      }
      const errors: Record<string, { message: string; type: string }> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (path && !errors[path]) {
          errors[path] = { message: issue.message, type: "manual" };
        }
      }
      return { values: {}, errors };
    },
    defaultValues: {
      delivery_date: undefined,
      logistics: "",
    },
  });

  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting },
  } = form;

  const deliveryDate = watch("delivery_date");

  useEffect(() => {
    if (!open) {
      reset();
      setErrorMessage(null);
      // pendingPayload is intentionally NOT cleared here;
      // it fires via onCloseAutoFocus on DialogContent
    }
  }, [open, reset]);

  const onSubmit = async (values: InTransitFormValues) => {
    if (!purchaseOrder) {
      return;
    }

    setErrorMessage(null);
    try {
      const result = await updateStatus.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        status: "IN_TRANSIT",
        options: {
          delivery_date: values.delivery_date.toISOString().split("T")[0],
          logistics: values.logistics.trim(),
        },
      });

      if (!(result.success && result.data)) {
        setErrorMessage(result.error || "Error al actualizar el estado");
        return;
      }

      if (
        accountingIntegrationEnabled &&
        result.accountingEvent &&
        result.accountingInformalEntryId
      ) {
        setPendingPayload(result.accountingEvent);
        setPendingInformalEntryId(result.accountingInformalEntryId);
      }
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al actualizar el estado del pedido"
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-[600px]"
        onCloseAutoFocus={() => {
          if (pendingPayload && pendingInformalEntryId) {
            onAccountingPayload?.(pendingPayload, pendingInformalEntryId);
            setPendingPayload(null);
            setPendingInformalEntryId(null);
          }
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5 text-orange-500" />
            <DialogTitle>Marcar como En Tránsito</DialogTitle>
          </div>
          <DialogDescription>
            Confirme que el pedido está en camino y proporcione la información
            de entrega.
          </DialogDescription>
        </DialogHeader>
        {isLoading || isOrgSettingsLoading ? (
          <div className="py-4 text-center text-muted-foreground text-sm">
            Cargando información del pedido...
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel>
                  Fecha estimada de entrega{" "}
                  <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !deliveryDate && "text-muted-foreground"
                        )}
                        type="button"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {deliveryDate ? (
                          format(deliveryDate, "PPP", { locale: es })
                        ) : (
                          <span>Seleccione una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => {
                          if (date) {
                            setValue("delivery_date", date, {
                              shouldValidate: true,
                            });
                          }
                        }}
                        selected={deliveryDate}
                      />
                    </PopoverContent>
                  </Popover>
                  <FieldError errors={[form.formState.errors.delivery_date]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>
                  Empresa de logística{" "}
                  <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...form.register("logistics")}
                    disabled={isSubmitting || isOrgSettingsLoading}
                    placeholder="Nombre de la empresa"
                  />
                  <FieldError errors={[form.formState.errors.logistics]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            {errorMessage && (
              <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                {errorMessage}
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button
                disabled={isSubmitting || isOrgSettingsLoading}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={isSubmitting || isOrgSettingsLoading}
                type="submit"
              >
                <TruckIcon className="mr-2 h-4 w-4" />
                Marcar como En Tránsito
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
