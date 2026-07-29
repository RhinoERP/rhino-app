"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Plus } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createSalesPriceListAction } from "@/modules/sales-price-lists/actions/create-sales-price-list.action";
import { updateSalesPriceListAction } from "@/modules/sales-price-lists/actions/update-sales-price-list.action";
import { salesPriceListsQueryKey } from "@/modules/sales-price-lists/queries/query-keys";
import type {
  CreateSalesPriceListInput,
  SalesPriceList,
  SalesPriceListType,
} from "@/modules/sales-price-lists/types";

const salesPriceListSchema = z
  .object({
    name: z.string().min(1, "El nombre de la lista es obligatorio"),
    type: z.enum(["PERCENTAGE", "PRICE"]),
    value: z.number(),
    valid_from: z.date({
      message: "La fecha de vigencia es obligatoria",
    }),
    is_active: z.boolean(),
    notes: z.string().optional(),
    extraCommissionRate: z.number().min(0).max(100).optional(),
  })
  .superRefine((values, context) => {
    if (values.type === "PERCENTAGE") {
      if (values.value < -100) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El porcentaje no puede ser menor a -100%",
          path: ["value"],
        });
      }

      if (values.value > 1000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El porcentaje no puede ser mayor a 1000%",
          path: ["value"],
        });
      }
    }
  });

type SalesPriceListFormValues = z.infer<typeof salesPriceListSchema>;

type SalesPriceListDialogProps = {
  orgSlug: string;
  priceList?: SalesPriceList | null;
  onSuccess?: () => void;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  commissionsEnabled?: boolean;
};

export function CreateSalesPriceListDialog({
  orgSlug,
  priceList,
  onSuccess,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  commissionsEnabled = false,
}: SalesPriceListDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const isEditing = Boolean(priceList);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const form = useForm<SalesPriceListFormValues>({
    resolver: zodResolver(salesPriceListSchema),
    defaultValues: {
      name: "",
      type: "PERCENTAGE",
      value: 0,
      valid_from: new Date(),
      is_active: true,
      notes: "",
      extraCommissionRate: 0,
    },
  });

  const selectedType = form.watch("type") as SalesPriceListType;

  useEffect(() => {
    if (open && isEditing && priceList) {
      form.reset({
        name: priceList.name ?? "",
        type: priceList.type ?? "PERCENTAGE",
        value: priceList.value ?? priceList.percentage ?? 0,
        valid_from: priceList.valid_from
          ? new Date(priceList.valid_from)
          : new Date(),
        is_active: priceList.is_active ?? true,
        notes: priceList.notes ?? "",
        extraCommissionRate: priceList.extra_commission_rate ?? 0,
      });
    } else if (open && !isEditing) {
      form.reset({
        name: "",
        type: "PERCENTAGE",
        value: 0,
        valid_from: new Date(),
        is_active: true,
        notes: "",
        extraCommissionRate: 0,
      });
    }
  }, [open, isEditing, priceList, form]);

  const handleUpdate = async (values: SalesPriceListFormValues) => {
    if (!priceList) {
      throw new Error("Lista de precios no encontrada");
    }

    const result = await updateSalesPriceListAction(orgSlug, priceList.id, {
      name: values.name,
      type: values.type,
      value: values.value,
      valid_from: format(values.valid_from, "yyyy-MM-dd"),
      is_active: values.is_active,
      notes: values.notes || null,
      extraCommissionRate: values.extraCommissionRate ?? 0,
    });

    if (!result.success) {
      throw new Error(
        result.error || "Error al actualizar la lista de precios"
      );
    }
  };

  const handleCreate = async (values: SalesPriceListFormValues) => {
    const input: CreateSalesPriceListInput = {
      orgSlug,
      name: values.name,
      type: values.type,
      value: values.value,
      valid_from: format(values.valid_from, "yyyy-MM-dd"),
      is_active: values.is_active,
      notes: values.notes || null,
      extraCommissionRate: values.extraCommissionRate ?? 0,
    };

    const result = await createSalesPriceListAction(input);

    if (!result.success) {
      throw new Error(result.error || "Error al crear la lista de precios");
    }
  };

  const handleSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: salesPriceListsQueryKey(orgSlug),
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
      ? "Error al actualizar la lista de precios"
      : "Error al crear la lista de precios";
  };

  const onSubmit = async (values: SalesPriceListFormValues) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isEditing && priceList) {
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
            Nueva lista de precios
          </Button>
        </DialogTrigger>
      )}
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Editar lista de precios de venta"
              : "Crear lista de precios de venta"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza los datos de la lista de precios."
              : "Crea una nueva lista de precios con ajuste por porcentaje o precio fijo."}
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
                        placeholder="Lista Mayorista 10%"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de ajuste</FormLabel>
                    <FormControl>
                      <Select
                        disabled={isSubmitting}
                        onValueChange={(value) =>
                          field.onChange(value as SalesPriceListType)
                        }
                        value={field.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona un tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">Porcentaje</SelectItem>
                          <SelectItem value="PRICE">Ajuste fijo</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {selectedType === "PRICE"
                        ? "Ajuste fijo ($)"
                        : "Porcentaje (%)"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        onChange={(e) =>
                          field.onChange(Number.parseFloat(e.target.value) || 0)
                        }
                        placeholder={selectedType === "PRICE" ? "1500" : "10"}
                        type="number"
                        value={field.value === 0 ? "" : field.value}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      {selectedType === "PRICE"
                        ? "Puede ser positivo (+) o negativo (-). Se suma/resta sobre el precio base."
                        : "Puede ser positivo (ej: 10) o negativo (ej: -5)."}
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
                        Porcentaje adicional de comisión para el vendedor al
                        usar esta lista. 0 = sin extra.
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
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Notas adicionales..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
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
                  return isEditing ? "Actualizar lista" : "Crear lista";
                })()}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
