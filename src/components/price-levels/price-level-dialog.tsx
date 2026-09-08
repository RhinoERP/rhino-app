"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Plus } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createPriceLevelAction } from "@/modules/price-levels/actions/create-price-level.action";
import { updatePriceLevelAction } from "@/modules/price-levels/actions/update-price-level.action";
import { priceLevelsQueryKey } from "@/modules/price-levels/queries/query-keys";
import type {
  CreatePriceLevelInput,
  PriceLevel,
} from "@/modules/price-levels/types";

const priceLevelSchema = z
  .object({
    name: z.string().min(1, "El nombre del nivel es obligatorio"),
    margin: z.number(),
    extraCommissionRate: z.number().min(0).max(100).optional(),
    valid_from: z.date({
      message: "La fecha de vigencia es obligatoria",
    }),
    is_active: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.margin < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El margen no puede ser negativo",
        path: ["margin"],
      });
    }
  });

type PriceLevelFormValues = z.infer<typeof priceLevelSchema>;

type PriceLevelDialogProps = {
  orgSlug: string;
  priceLevel?: PriceLevel | null;
  commissionsEnabled?: boolean;
  onSuccess?: () => void;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function PriceLevelDialog({
  orgSlug,
  priceLevel,
  commissionsEnabled = false,
  onSuccess,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: PriceLevelDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const isEditing = Boolean(priceLevel);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const form = useForm<PriceLevelFormValues>({
    resolver: zodResolver(priceLevelSchema),
    defaultValues: {
      name: "",
      margin: 0,
      valid_from: new Date(),
      is_active: true,
    },
  });

  const resetForm = useCallback(
    (editing: boolean, data: PriceLevel | null | undefined) => {
      if (editing && data) {
        form.reset({
          name: data.name ?? "",
          margin: data.margin ?? 0,
          extraCommissionRate: data.extra_commission_rate ?? 0,
          valid_from: data.valid_from ? new Date(data.valid_from) : new Date(),
          is_active: data.is_active ?? true,
        });
      } else {
        form.reset({
          name: "",
          margin: 0,
          valid_from: new Date(),
          is_active: true,
        });
      }
    },
    [form]
  );

  useEffect(() => {
    if (open) {
      resetForm(isEditing, priceLevel);
    }
  }, [open, isEditing, priceLevel, resetForm]);

  const handleUpdate = async (values: PriceLevelFormValues) => {
    if (!priceLevel) {
      throw new Error("Nivel de precio no encontrado");
    }

    const result = await updatePriceLevelAction(orgSlug, priceLevel.id, {
      name: values.name,
      margin: values.margin,
      validFrom: format(values.valid_from, "yyyy-MM-dd"),
      isActive: values.is_active,
      extraCommissionRate: values.extraCommissionRate,
    });

    if (!result.success) {
      throw new Error(result.error || "Error al actualizar el nivel");
    }
  };

  const handleCreate = async (values: PriceLevelFormValues) => {
    const input: CreatePriceLevelInput = {
      orgSlug,
      name: values.name,
      margin: values.margin,
      validFrom: format(values.valid_from, "yyyy-MM-dd"),
      isActive: values.is_active,
      extraCommissionRate: values.extraCommissionRate,
    };

    const result = await createPriceLevelAction(input);

    if (!result.success) {
      throw new Error(result.error || "Error al crear el nivel");
    }
  };

  const handleSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: priceLevelsQueryKey(orgSlug),
    });

    setOpen(false);
    form.reset();
    onSuccess?.();
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    return isEditing
      ? "Error al actualizar el nivel de precio"
      : "Error al crear el nivel de precio";
  };

  const onSubmit = async (values: PriceLevelFormValues) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isEditing && priceLevel) {
        await handleUpdate(values);
      } else {
        await handleCreate(values);
      }

      await handleSuccess();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          form.reset();
          setErrorMessage(null);
        }
      }}
      open={open}
    >
      {!trigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo nivel
          </Button>
        </DialogTrigger>
      )}
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar nivel de margen" : "Crear nivel de margen"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza el nivel de margen de lista."
              : "Crea un nivel de margen de lista (ej. Lista 35, Lista 45, Lista 55)."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Lista 45"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="margin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Margen (%)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        onChange={(e) =>
                          field.onChange(Number.parseFloat(e.target.value) || 0)
                        }
                        placeholder="45"
                        type="number"
                        value={field.value === 0 ? "" : field.value}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Precio = costo × (1 + margen/100).
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {commissionsEnabled && (
                <FormField
                  control={form.control}
                  name="extraCommissionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comisión extra (%)</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          type="number"
                          value={field.value === 0 ? "" : field.value}
                        />
                      </FormControl>
                      <p className="text-muted-foreground text-xs">
                        Se suma a la comisión base del vendedor al usar este
                        nivel.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="valid_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vigencia desde</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isSubmitting}
                            type="button"
                            variant="outline"
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Selecciona una fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          onSelect={field.onChange}
                          selected={field.value}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Activo</FormLabel>
                      <p className="text-muted-foreground text-xs">
                        Si está inactivo, no se ofrece en el selector de nivel.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        disabled={isSubmitting}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {errorMessage && (
                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {(() => {
                  if (isSubmitting) {
                    return isEditing ? "Actualizando..." : "Creando...";
                  }
                  return isEditing ? "Actualizar nivel" : "Crear nivel";
                })()}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
