"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { createBankMovementAction } from "@/modules/tesoreria/actions/create-bank-movement.action";
import {
  ACCOUNTING_ACCOUNTS,
  BANK_MOVEMENT_TYPE_LABELS,
  type BankAccount,
} from "@/modules/tesoreria/types";

const schema = z.object({
  bank_account_id: z.string().min(1, "Seleccioná una cuenta bancaria"),
  movement_type: z.enum([
    "debit",
    "credit",
    "adjustment_positive",
    "adjustment_negative",
    "rejected_check",
  ]),
  concept: z.string().min(1, "Ingresá un concepto"),
  amount: z.coerce.number().positive("El importe debe ser mayor a 0"),
  movement_date: z.string().min(1, "Seleccioná una fecha"),
  accounting_account_code: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  orgSlug: string;
  bankAccounts: BankAccount[];
};

export function NewMovementDialog({ orgSlug, bankAccounts }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      movement_type: "debit",
      movement_date: new Date().toISOString().split("T")[0],
    },
  });

  const watchedType = form.watch("movement_type");
  const watchedAccount = form.watch("accounting_account_code");
  const isDebitType = watchedType === "debit" || watchedType === "rejected_check";
  const selectedAccountObj = ACCOUNTING_ACCOUNTS.find(
    (a) => a.code === watchedAccount
  );
  const isBlockedAccount = selectedAccountObj?.blockedForBankMovements;

  async function onSubmit(values: FormValues) {
    if (isBlockedAccount) {
      toast.error(
        "No podés usar Ingresos Brutos a Pagar para movimientos bancarios. Usá Gastos Bancarios (5.1.01)."
      );
      return;
    }

    setLoading(true);
    const accountObj = ACCOUNTING_ACCOUNTS.find(
      (a) => a.code === values.accounting_account_code
    );

    const result = await createBankMovementAction(orgSlug, {
      ...values,
      accounting_account_name: accountObj?.name,
    });

    if (result.success) {
      toast.success("Movimiento registrado correctamente");
      setOpen(false);
      form.reset();
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="mr-1.5 size-4" weight="bold" />
          Nuevo movimiento
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento bancario</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Tipo de ajuste */}
            <FormField
              control={form.control}
              name="movement_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de ajuste</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná el tipo..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(BANK_MOVEMENT_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Cuenta bancaria */}
              <FormField
                control={form.control}
                name="bank_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta bancaria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bankAccounts.length === 0 ? (
                          <SelectItem disabled value="_none">
                            Sin cuentas configuradas
                          </SelectItem>
                        ) : (
                          bankAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fecha */}
              <FormField
                control={form.control}
                name="movement_date"
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

            {/* Concepto */}
            <FormField
              control={form.control}
              name="concept"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Concepto</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Retención IIBB transferencia..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Importe */}
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importe</FormLabel>
                    <FormControl>
                      <Input
                        min={0}
                        placeholder="0,00"
                        step="0.01"
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cuenta contable */}
              <FormField
                control={form.control}
                name="accounting_account_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta contable</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACCOUNTING_ACCOUNTS.map((acc) => (
                          <SelectItem
                            className={
                              acc.blockedForBankMovements
                                ? "text-muted-foreground line-through"
                                : ""
                            }
                            key={acc.code}
                            value={acc.code}
                          >
                            {acc.code} — {acc.name}
                            {acc.blockedForBankMovements ? " ⛔" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Alerta: IIBB en débito bancario */}
            {isDebitType && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <WarningIcon className="size-4 text-amber-600" weight="duotone" />
                <AlertDescription className="text-sm">
                  <strong>Regla contable:</strong> Si el banco retiene Ingresos
                  Brutos automáticamente, imputalo a{" "}
                  <strong>5.1.01 — Gastos Bancarios</strong>. La cuenta{" "}
                  <em>Ingresos Brutos a Pagar</em> es exclusiva para
                  facturación.
                </AlertDescription>
              </Alert>
            )}

            {/* Alerta: cuenta bloqueada seleccionada */}
            {isBlockedAccount && (
              <Alert variant="destructive">
                <WarningIcon className="size-4" weight="duotone" />
                <AlertDescription className="text-sm">
                  Esta cuenta está bloqueada para movimientos bancarios. Usá{" "}
                  <strong>5.1.01 — Gastos Bancarios</strong> para retenciones
                  bancarias.
                </AlertDescription>
              </Alert>
            )}

            {/* Notas */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Observaciones adicionales..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                disabled={loading}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={loading || isBlockedAccount} type="submit">
                {loading ? "Guardando..." : "Guardar movimiento"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
