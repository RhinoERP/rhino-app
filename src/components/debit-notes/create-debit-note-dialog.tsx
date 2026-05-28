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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { createDebitNoteAction } from "@/modules/debit-notes/actions/create-debit-note.action";
import { debitNotesQueryKey } from "@/modules/debit-notes/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

const ELIGIBLE_STATUSES = new Set(["CONFIRMED", "DISPATCH", "DELIVERED"]);

const formSchema = z.object({
  salesOrderId: z.string().min(1, "Selecciona una venta"),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  observations: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type CreateDebitNoteDialogProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

function getButtonText(isSubmitting: boolean): string {
  return isSubmitting ? "Creando..." : "Crear nota de débito";
}

export function CreateDebitNoteDialog({
  orgSlug,
  sales,
}: CreateDebitNoteDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eligibleSales = sales.filter((s) => ELIGIBLE_STATUSES.has(s.status));

  const defaultValues = useMemo(
    () => ({
      salesOrderId: "",
      amount: 0,
      observations: "",
    }),
    []
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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
      const result = await createDebitNoteAction({
        orgSlug,
        salesOrderId: values.salesOrderId,
        amount: values.amount,
        observations: values.observations?.trim() || null,
      });

      if (!result.success) {
        setErrorMessage(result.error ?? "Error al crear la nota de débito");
        return;
      }

      toast.success(
        `Nota de débito ${result.debitNoteNumber} creada correctamente`
      );
      handleClose();
      queryClient.invalidateQueries({
        queryKey: debitNotesQueryKey(orgSlug),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

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
        <Button>
          <PlusIcon className="mr-2 size-4" weight="bold" />
          Nueva nota de débito
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva nota de débito</DialogTitle>
          <DialogDescription>
            Seleccioná la venta de referencia e ingresá el monto a debitar.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="salesOrderId"
                render={({ field }) => {
                  const _selectedSale = eligibleSales.find(
                    (s) => s.id === field.value
                  );
                  return (
                    <FormItem>
                      <FormLabel>Venta *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.clearErrors("amount");
                          form.setValue("amount", 0);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger id="nd-sale">
                            <SelectValue placeholder="Seleccioná una venta..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {eligibleSales.length === 0 ? (
                            <div className="px-2 py-4 text-center text-muted-foreground text-sm">
                              No hay ventas elegibles
                            </div>
                          ) : (
                            eligibleSales.map((s) => {
                              const customerName =
                                s.customer?.fantasy_name ??
                                s.customer?.business_name ??
                                "—";
                              const label = s.invoice_number
                                ? `${s.invoice_number} — ${customerName}`
                                : `N°${s.sale_number} — ${customerName}`;
                              return (
                                <SelectItem key={s.id} value={s.id}>
                                  {label} ·{" "}
                                  {formatCurrency(Number(s.total_amount ?? 0))}
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => {
                  const selectedSale = eligibleSales.find(
                    (s) => s.id === form.watch("salesOrderId")
                  );
                  return (
                    <FormItem>
                      <FormLabel>
                        Monto *
                        {selectedSale && (
                          <span className="ml-1 font-normal text-muted-foreground text-xs">
                            (venta:{" "}
                            {formatCurrency(
                              Number(selectedSale.total_amount ?? 0)
                            )}
                            )
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="nd-amount"
                          min={0.01}
                          placeholder="0.00"
                          step={0.01}
                          type="number"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Observaciones{" "}
                      <span className="font-normal text-muted-foreground">
                        (opcional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Motivo de la nota de débito..."
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
                {getButtonText(isSubmitting)}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
