"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { createSaleAdvanceAction } from "@/modules/sale-advances/actions/sale-advances.actions";
import { saleAdvancesQueryKey } from "@/modules/sale-advances/queries/query-keys";

const formSchema = z.object({
  description: z.string().min(1, "La descripción es obligatoria"),
  netAmount: z.coerce.number().positive("El importe debe ser mayor a 0"),
  taxRate: z.coerce
    .number()
    .min(0, "El IVA no puede ser negativo")
    .max(100, "El IVA no puede superar 100%"),
});

type FormValues = z.infer<typeof formSchema>;

type NewAdvanceDialogProps = {
  orgSlug: string;
  quoteId?: string;
  quoteNumber?: string | number;
};

function getButtonText(isSubmitting: boolean): string {
  return isSubmitting ? "Creando..." : "Crear anticipo";
}

export function NewAdvanceDialog({
  orgSlug,
  quoteId,
  quoteNumber,
}: NewAdvanceDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultValues = useMemo(
    () => ({
      description: quoteNumber
        ? `50% anticipo OC #${quoteNumber}`
        : "50% anticipo",
      netAmount: 0,
      taxRate: 21,
    }),
    [quoteNumber]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting },
  } = form;

  const netAmount = watch("netAmount");
  const taxRate = watch("taxRate");
  const net = netAmount || 0;
  const tax = truncateMoney(net * (taxRate / 100));
  const total = truncateMoney(net + tax);

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setErrorMessage(null);
    }
  }, [open, reset, defaultValues]);

  const handleClose = () => {
    setOpen(false);
    reset();
    setErrorMessage(null);
  };

  const onSubmit = async (values: FormValues) => {
    setErrorMessage(null);
    try {
      const result = await createSaleAdvanceAction({
        orgSlug,
        description: values.description.trim(),
        net_amount: values.netAmount,
        tax_rate: values.taxRate / 100,
        quote_id: quoteId,
      });

      if (result.success) {
        toast.success(
          `Anticipo #${result.data?.advance_number} creado correctamente`
        );
        handleClose();
        queryClient.invalidateQueries({
          queryKey: saleAdvancesQueryKey(orgSlug),
        });
      } else {
        setErrorMessage(result.error ?? "Error al crear el anticipo");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

  const isButtonDisabled =
    isSubmitting || net <= 0 || !form.watch("description").trim();

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          reset();
          setErrorMessage(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusIcon className="size-4" weight="bold" />
          Nuevo anticipo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Factura de anticipo</DialogTitle>
          <DialogDescription>
            Generá una factura de anticipo (generalmente 50% del pedido). El
            sistema calculará el IVA automáticamente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ej: 50% anticipo OC #1234"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="netAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Importe neto</FormLabel>
                      <FormControl>
                        <Input
                          min="0.01"
                          placeholder="0.00"
                          step="0.01"
                          type="number"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IVA %</FormLabel>
                      <FormControl>
                        <Input
                          max="100"
                          min="0"
                          step="0.5"
                          type="number"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {net > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Neto</span>
                      <span className="tabular-nums">
                        {formatCurrency(net)}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>IVA {taxRate}%</span>
                      <span className="tabular-nums">
                        {formatCurrency(tax)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Total anticipo</span>
                      <span className="tabular-nums">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </>
              )}

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
              <Button disabled={isButtonDisabled} type="submit">
                {getButtonText(isSubmitting)}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
