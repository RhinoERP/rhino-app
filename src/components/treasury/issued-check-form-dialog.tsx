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
import { createChequeEmitidoAction } from "@/modules/treasury/actions/checks.action";
import { useTreasuryOperationId } from "@/modules/treasury/hooks/use-treasury-operation-id";
import { useCuentasBancarias } from "@/modules/treasury/queries/queries.client";

const formSchema = z
  .object({
    cuentaBancariaId: z.string().uuid("Selecciona una cuenta bancaria"),
    numeroCheque: z.string().min(1, "Requerido").max(50),
    tipo: z.enum(["CDF", "ECH"]),
    importe: z
      .string()
      .refine(isValidAmountInput, "Importe inválido")
      .refine(
        (value) => parseAmountInput(value) > 0,
        "El importe debe ser mayor a cero"
      ),
    fechaEmision: z.string().min(1, "Requerido"),
    fechaDebito: z.string().min(1, "Requerido"),
    beneficiario: z.string().min(1, "Requerido").max(200),
    notas: z.string().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.fechaDebito < values.fechaEmision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de débito no puede ser anterior a la emisión",
        path: ["fechaDebito"],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
  onSuccess?: () => void;
};

const getDefaultValues = (): FormValues => {
  const today = new Date().toISOString().split("T")[0] ?? "";

  return {
    cuentaBancariaId: "",
    numeroCheque: "",
    tipo: "CDF",
    importe: "",
    fechaEmision: today,
    fechaDebito: today,
    beneficiario: "",
    notas: "",
  };
};

export function IssuedCheckFormDialog({
  open,
  onOpenChange,
  orgId,
  orgSlug,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const { getOperationId, resetOperationId } = useTreasuryOperationId();
  const { data: cuentas = [] } = useCuentasBancarias(orgId, {
    soloActivas: true,
    enabled: open,
  });
  const hasActiveAccounts = cuentas.length > 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  useEffect(() => {
    const subscription = form.watch((_value, { type }) => {
      if (type === "change") {
        resetOperationId();
      }
    });

    return () => subscription.unsubscribe();
  }, [form, resetOperationId]);

  useEffect(() => {
    if (!open) {
      form.reset(getDefaultValues());
      resetOperationId();
    }
  }, [form, open, resetOperationId]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createChequeEmitidoAction(orgSlug, {
        operationId: getOperationId(),
        cuentaBancariaId: values.cuentaBancariaId,
        numeroCheque: values.numeroCheque,
        tipo: values.tipo,
        importe: parseAmountInput(values.importe).toFixed(4),
        fechaEmision: values.fechaEmision,
        fechaDebito: values.fechaDebito,
        beneficiario: values.beneficiario,
        notas: values.notas || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Cheque emitido registrado en cartera");
      resetOperationId();
      form.reset(getDefaultValues());
      onOpenChange(false);
      onSuccess?.();
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar cheque emitido</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="cuentaBancariaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta bancaria</FormLabel>
                  <Select
                    disabled={!hasActiveAccounts}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una cuenta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cuentas.map((cuenta) => (
                        <SelectItem key={cuenta.id} value={cuenta.id}>
                          {cuenta.nombre} — {cuenta.banco} ({cuenta.moneda})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasActiveAccounts ? null : (
                    <p className="text-muted-foreground text-sm">
                      No hay cuentas bancarias activas para emitir cheques.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="numeroCheque"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° de cheque</FormLabel>
                    <FormControl>
                      <Input placeholder="00001234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de cheque</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CDF">
                          CDF — Cheque diferido físico
                        </SelectItem>
                        <SelectItem value="ECH">ECH — E-cheq</SelectItem>
                      </SelectContent>
                    </Select>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fechaEmision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de emisión</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fechaDebito"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de débito</FormLabel>
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
              name="beneficiario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beneficiario</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del beneficiario" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Observaciones" {...field} />
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
              <Button disabled={isPending || !hasActiveAccounts} type="submit">
                {isPending ? "Guardando..." : "Cargar cheque"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
