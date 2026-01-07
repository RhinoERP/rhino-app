"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Plus } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { createSalesPriceListAction } from "@/modules/sales-price-lists/actions/create-sales-price-list.action";
import { salesPriceListsQueryKey } from "@/modules/sales-price-lists/queries/query-keys";
import type { CreateSalesPriceListInput } from "@/modules/sales-price-lists/types";

const salesPriceListSchema = z.object({
  name: z.string().min(1, "El nombre de la lista es obligatorio"),
  percentage: z
    .number()
    .min(-100, "El porcentaje no puede ser menor a -100%")
    .max(1000, "El porcentaje no puede ser mayor a 1000%"),
  valid_from: z.date({
    message: "La fecha de vigencia es obligatoria",
  }),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
});

type SalesPriceListFormValues = z.infer<typeof salesPriceListSchema>;

type CreateSalesPriceListDialogProps = {
  orgSlug: string;
};

export function CreateSalesPriceListDialog({
  orgSlug,
}: CreateSalesPriceListDialogProps) {
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<SalesPriceListFormValues>({
    resolver: zodResolver(salesPriceListSchema),
    defaultValues: {
      name: "",
      percentage: 0,
      valid_from: new Date(),
      is_active: true,
      notes: "",
    },
  });

  const onSubmit = async (values: SalesPriceListFormValues) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const input: CreateSalesPriceListInput = {
        orgSlug,
        name: values.name,
        percentage: values.percentage,
        valid_from: format(values.valid_from, "yyyy-MM-dd"),
        is_active: values.is_active,
        notes: values.notes || null,
      };

      const result = await createSalesPriceListAction(input);

      if (!result.success) {
        throw new Error(result.error || "Error al crear la lista de precios");
      }

      // Invalidate and refetch
      await queryClient.invalidateQueries({
        queryKey: salesPriceListsQueryKey(orgSlug),
      });

      setOpen(false);
      form.reset();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al crear la lista de precios"
      );
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
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nueva lista de precios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Crear lista de precios de venta</DialogTitle>
          <DialogDescription>
            Crea una nueva lista de precios que aplicará un porcentaje a todos
            los productos cuando se asigne a un cliente.
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
                name="percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porcentaje (%)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="10"
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(Number.parseFloat(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Puede ser positivo (ej: 10 para +10%) o negativo (ej: -5
                      para -5%)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                {isSubmitting ? "Creando..." : "Crear lista"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
