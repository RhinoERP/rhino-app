"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
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
import type { TreasuryBankAccount } from "@/lib/accounting-client";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import {
  createBankAccountAction,
  updateBankAccountAction,
} from "@/modules/treasury/actions/bank-accounts.action";

// ── Schema ─────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  nombre: z.string().min(1, "Requerido").max(200),
  banco: z.string().min(1, "Requerido").max(100),
  moneda: z.enum(["ARS", "USD"]),
  cuentaContableId: z.string().uuid("Selecciona una cuenta contable"),
  numerosCuenta: z.string().max(100).optional().or(z.literal("")),
  alias: z.string().max(100).optional().or(z.literal("")),
  descripcion: z.string().max(500).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId: string;
  cuenta?: TreasuryBankAccount;
  onSuccess?: () => void;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function BankAccountFormDialog({
  open,
  onOpenChange,
  orgSlug,
  orgId,
  cuenta,
  onSuccess,
}: Props) {
  const isEdit = !!cuenta;
  const [isPending, startTransition] = useTransition();

  // Cuentas contables tipo ACTIVO + permite_movimientos
  const { data: cuentasContables = [] } = useCuentas(orgId, { enabled: open });
  const cuentasActivo = cuentasContables.filter(
    (c) => c.tipo === "ACTIVO" && c.permite_movimientos
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: cuenta?.nombre ?? "",
      banco: cuenta?.banco ?? "",
      moneda: cuenta?.moneda ?? "ARS",
      cuentaContableId: cuenta?.cuenta_contable_id ?? "",
      numerosCuenta: cuenta?.numero_cuenta ?? "",
      alias: cuenta?.alias ?? "",
      descripcion: cuenta?.descripcion ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const input = {
        nombre: values.nombre,
        banco: values.banco,
        moneda: values.moneda,
        cuentaContableId: values.cuentaContableId,
        numerosCuenta: values.numerosCuenta || undefined,
        alias: values.alias || undefined,
        descripcion: values.descripcion || undefined,
      };

      const result = isEdit
        ? await updateBankAccountAction(orgSlug, cuenta.id, input)
        : await createBankAccountAction(orgSlug, input);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        isEdit ? "Cuenta bancaria actualizada" : "Cuenta bancaria creada"
      );
      onOpenChange(false);
      onSuccess?.();
    });
  }

  const submitLabel = isEdit ? "Guardar cambios" : "Crear cuenta";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre descriptivo</FormLabel>
                    <FormControl>
                      <Input placeholder="BBVA Cuenta Corriente" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="banco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Banco</FormLabel>
                    <FormControl>
                      <Input placeholder="BBVA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="numerosCuenta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      N° / CBU{" "}
                      <span className="text-muted-foreground">(opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="CBU o número" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="alias"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Alias{" "}
                      <span className="text-muted-foreground">(opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="alias.banco" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="moneda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moneda</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
                      <SelectItem value="USD">USD — Dólar</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cuentaContableId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta contable vinculada</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una cuenta ACTIVO" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cuentasActivo.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.codigo} — {c.nombre}
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
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Descripción{" "}
                    <span className="text-muted-foreground">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Notas internas" {...field} />
                  </FormControl>
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
                {isPending ? "Guardando..." : submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
