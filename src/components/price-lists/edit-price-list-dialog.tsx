"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { updatePriceListAction } from "@/modules/price-lists/actions/update-price-list.action";

const editPriceListSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  valid_from: z.date({
    message: "La fecha de vigencia es obligatoria",
  }),
});

type EditPriceListFormValues = z.infer<typeof editPriceListSchema>;

type EditPriceListDialogProps = {
  orgSlug: string;
  priceListId: string;
  currentName: string;
  currentValidFrom: string;
};

export function EditPriceListDialog({
  orgSlug,
  priceListId,
  currentName,
  currentValidFrom,
}: EditPriceListDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const form = useForm<EditPriceListFormValues>({
    resolver: zodResolver(editPriceListSchema),
    defaultValues: {
      name: currentName,
      valid_from: new Date(currentValidFrom),
    },
  });

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    []
  );

  const onSubmit = async (values: EditPriceListFormValues) => {
    if (!isMountedRef.current) {
      return;
    }
    setErrorMessage(null);

    try {
      const result = await updatePriceListAction({
        orgSlug,
        priceListId,
        name: values.name,
        valid_from: format(values.valid_from, "yyyy-MM-dd"),
      });

      if (!isMountedRef.current) {
        return;
      }

      if (!result.success) {
        throw new Error(
          result.error || "Error al actualizar la lista de precios"
        );
      }

      setOpen(false);
      router.refresh();
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar la lista de precios";
      setErrorMessage(message);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Lista de Precios</DialogTitle>
          <DialogDescription>
            Actualiza el nombre o la fecha de vigencia de la lista de precios.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={form.formState.isSubmitting}
                      placeholder="Nombre de la lista de precios"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valid_from"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de vigencia</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={form.formState.isSubmitting}
                          variant="outline"
                        >
                          {field.value ? (
                            format(field.value, "dd/MM/yyyy")
                          ) : (
                            <span>Seleccionar fecha</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
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

            {errorMessage && (
              <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-900/20 dark:text-red-400">
                {errorMessage}
              </div>
            )}

            <DialogFooter>
              <Button
                disabled={form.formState.isSubmitting}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting
                  ? "Guardando..."
                  : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
