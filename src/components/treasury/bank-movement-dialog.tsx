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
  parseAmountInput,
} from "@/lib/amounts";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import { createMovimientoBancarioAction } from "@/modules/treasury/actions/movements.action";
import { useTreasuryOperationId } from "@/modules/treasury/hooks/use-treasury-operation-id";
import { useCuentasBancarias } from "@/modules/treasury/queries/queries.client";

const formSchema = z.object({
  cuentaBancariaId: z.string().uuid("Selecciona una cuenta bancaria"),
  tipo: z.enum(["DEBITO_BANCARIO", "CREDITO_BANCARIO"]),
  fecha: z.string().min(1, "Requerido"),
  descripcion: z.string().min(1, "Requerido").max(500),
  importe: z.string().refine(isValidAmountInput, "Importe inválido"),
  cuentaContrapartidaCode: z
    .string()
    .min(1, "Selecciona una cuenta contrapartida"),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId: string;
  onSuccess?: () => void;
};

export function BankMovementDialog({
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
  // Only leaf accounts with a semantic code can be a counterpart
  const { data: todasCuentas = [] } = useCuentas(orgId, { enabled: open });
  const cuentasContrapartida = todasCuentas.filter(
    (c) => c.permite_movimientos && c.activa && c.account_code
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cuentaBancariaId: "",
      tipo: "DEBITO_BANCARIO",
      fecha: new Date().toISOString().split("T")[0],
      descripcion: "",
      importe: "",
      cuentaContrapartidaCode: "",
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
      const result = await createMovimientoBancarioAction(orgSlug, {
        operationId: getOperationId(),
        cuentaBancariaId: values.cuentaBancariaId,
        tipo: values.tipo,
        fecha: values.fecha,
        descripcion: values.descripcion,
        importe: parseAmountInput(values.importe).toFixed(4),
        cuentaContrapartidaCode: values.cuentaContrapartidaCode,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Movimiento registrado");
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
          <DialogTitle>Registrar movimiento bancario</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="cuentaBancariaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta bancaria</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una cuenta" />
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

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DEBITO_BANCARIO">Débito</SelectItem>
                        <SelectItem value="CREDITO_BANCARIO">
                          Crédito
                        </SelectItem>
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
            </div>

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
                    <Input placeholder="Detalle del movimiento" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cuentaContrapartidaCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta contrapartida</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una cuenta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cuentasContrapartida.map((c) => (
                        <SelectItem key={c.id} value={c.account_code ?? ""}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                disabled={isPending}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
