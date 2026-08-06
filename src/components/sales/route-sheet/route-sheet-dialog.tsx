"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { useRouteSheetMutations } from "@/modules/route-sheets/hooks/use-route-sheets-mutations";

const routeSheetSchema = z.object({
  carrierId: z.string().min(1, "El transporte es obligatorio"),
  scheduledDate: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().optional(),
});

type RouteSheetFormValues = z.infer<typeof routeSheetSchema>;

function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type RouteSheetDialogProps = {
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

export function RouteSheetDialog({
  orgSlug,
  open,
  onOpenChange,
  onCreated,
}: RouteSheetDialogProps) {
  const { createRouteSheet } = useRouteSheetMutations(orgSlug);
  const { data: carriers = [] } = useCarriers(orgSlug);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultValues = useMemo(
    () => ({
      carrierId: "",
      scheduledDate: todayISO(),
      notes: "",
    }),
    []
  );

  const form = useForm<RouteSheetFormValues>({
    resolver: zodResolver(routeSheetSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  useEffect(() => {
    if (open) {
      reset(defaultValues);
    }
  }, [open, reset, defaultValues]);

  const handleClose = () => {
    onOpenChange(false);
    setErrorMessage(null);
    reset();
  };

  const onSubmit = async (values: RouteSheetFormValues) => {
    setErrorMessage(null);
    try {
      await createRouteSheet.mutateAsync({
        carrierId: values.carrierId,
        scheduledDate: values.scheduledDate,
        notes: values.notes?.trim() || null,
      });
      onCreated?.();
      handleClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al crear la hoja de ruta"
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nueva hoja de ruta</DialogTitle>
          <DialogDescription>
            Organizá los despachos de un transporte para una fecha.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="carrierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transporte</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná un transporte" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {carriers.map((carrier) => (
                          <SelectItem key={carrier.id} value={carrier.id}>
                            {carrier.name}
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
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha programada</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="ej. Entregar antes de las 18hs"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {errorMessage && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={handleClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creando..." : "Crear hoja de ruta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
