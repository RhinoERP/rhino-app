"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  formatAmountInput,
  isValidAmountInput,
  normalizeAmountInput,
} from "@/lib/amounts";
import { createBoletaDepositoEfectivoAction } from "@/modules/treasury/actions/deposit-slips.action";
import { useTreasuryOperationId } from "@/modules/treasury/hooks/use-treasury-operation-id";
import { useCuentasBancarias } from "@/modules/treasury/queries/queries.client";

// Semantic codes for cash accounts available in DEPOSITO_EFECTIVO rule options
const CAJA_OPTIONS = [
  { value: "CAJA_PESOS", label: "Caja Pesos" },
  { value: "BANCO_BBVA_PESOS", label: "Banco BBVA Pesos" },
  { value: "BANCO_SUPERVIELLE_PESOS", label: "Banco Supervielle Pesos" },
  { value: "MERCADO_PAGO", label: "Mercado Pago" },
  { value: "CALFPAY", label: "Calfpay" },
];

const formSchema = z.object({
  cuentaBancariaId: z.string().uuid("Selecciona una cuenta bancaria"),
  fecha: z.string().min(1, "Requerido"),
  descripcion: z.string().min(1, "Requerido").max(500),
  importe: z.string().refine(isValidAmountInput, "Importe inválido"),
  cuentaCajaCode: z.string().min(1, "Selecciona la cuenta de origen"),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId: string;
  onSuccess?: () => void;
};

export function CashDepositSlipDialog({
  open,
  onOpenChange,
  orgSlug,
  orgId,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const { getOperationId, resetOperationId } = useTreasuryOperationId();
  const { data: cuentas = [] } = useCuentasBancarias(orgId, {
    soloActivas: true,
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cuentaBancariaId: "",
      fecha: new Date().toISOString().split("T")[0],
      descripcion: "",
      importe: "",
      cuentaCajaCode: "",
    },
  });

  useEffect(() => {
    const subscription = form.watch((_value, { type }) => {
      if (type === "change") {
        resetOperationId();
      }
    });

    return () => subscription.unsubscribe();
  }, [form, resetOperationId]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createBoletaDepositoEfectivoAction(orgSlug, {
        operationId: getOperationId(),
        cuentaBancariaId: values.cuentaBancariaId,
        fecha: values.fecha,
        descripcion: values.descripcion,
        importe: normalizeAmountInput(values.importe),
        cuentaCajaCode: values.cuentaCajaCode,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Boleta de depósito de efectivo registrada");
      resetOperationId();
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Depósito de Efectivo</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="cuentaBancariaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta bancaria destino</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cuentas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} — {c.banco}
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
              name="cuentaCajaCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta de origen (caja)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar origen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CAJA_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
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
              name="fecha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="importe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importe</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="decimal"
                      onChange={(event) =>
                        field.onChange(formatAmountInput(event.target.value))
                      }
                      placeholder="0,00"
                      value={formatAmountInput(field.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input placeholder="Descripción del depósito" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Registrando..." : "Confirmar depósito"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
