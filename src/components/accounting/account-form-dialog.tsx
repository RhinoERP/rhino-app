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
import { Switch } from "@/components/ui/switch";
import type { CuentaItem } from "@/lib/accounting-client";
import {
  createCuentaAction,
  updateCuentaAction,
} from "@/modules/accounting/actions/chart-of-accounts.action";
import { useCuentas } from "@/modules/accounting/queries/queries.client";

// ── Schema ────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  accountCode: z.string().max(80).optional().or(z.literal("")),
  tipo: z.enum(["ACTIVO", "PASIVO", "PN", "INGRESO", "EGRESO"]),
  naturaleza: z.enum(["DEUDORA", "ACREEDORA"]),
  permiteMovimientos: z.boolean(),
  activa: z.boolean(),
  padreId: z.string().uuid().optional().or(z.literal("")),
  moneda: z.enum(["ARS", "USD", "AMBAS"]),
});

type FormValues = z.infer<typeof formSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

type AccountFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId: string;
  /** If provided, the dialog operates in edit mode */
  cuenta?: CuentaItem;
  /** Pre-select tipo when creating a new account */
  defaultTipo?: "ACTIVO" | "PASIVO" | "PN" | "INGRESO" | "EGRESO";
  /** Called after a successful create/update */
  onSuccess?: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AccountFormDialog({
  open,
  onOpenChange,
  orgSlug,
  orgId,
  cuenta,
  defaultTipo,
  onSuccess,
}: AccountFormDialogProps) {
  const isEdit = !!cuenta;
  const [isPending, startTransition] = useTransition();

  // Load accounts for parent selector (filter to non-movement accounts)
  const { data: cuentas = [] } = useCuentas(orgId, { enabled: open });
  const parentOptions = cuentas.filter((c) => !c.permite_movimientos);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo: cuenta?.codigo ?? "",
      nombre: cuenta?.nombre ?? "",
      accountCode: cuenta?.account_code ?? "",
      tipo: cuenta?.tipo ?? defaultTipo ?? "ACTIVO",
      naturaleza: cuenta?.naturaleza ?? "DEUDORA",
      permiteMovimientos: cuenta?.permite_movimientos ?? true,
      activa: cuenta?.activa ?? true,
      padreId: cuenta?.padre_id ?? "",
      moneda: (cuenta?.moneda as "ARS" | "USD" | "AMBAS") ?? "ARS",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const input = {
        codigo: values.codigo,
        nombre: values.nombre,
        accountCode: values.accountCode || undefined,
        tipo: values.tipo,
        naturaleza: values.naturaleza,
        permiteMovimientos: values.permiteMovimientos,
        activa: values.activa,
        padreId: values.padreId || undefined,
        moneda: values.moneda,
      };

      const result = isEdit
        ? await updateCuentaAction(orgSlug, cuenta.id, input)
        : await createCuentaAction(orgSlug, input);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        isEdit
          ? "Cuenta actualizada correctamente"
          : "Cuenta creada correctamente"
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
            {isEdit ? "Editar cuenta contable" : "Nueva cuenta contable"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Código + Nombre */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="codigo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input placeholder="1.1.05" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Deudores por Ventas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Account Code semántico */}
            <FormField
              control={form.control}
              name="accountCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Account code{" "}
                    <span className="text-muted-foreground">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="AR_DEUDORES_VENTAS"
                      {...field}
                      className="font-mono text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo + Naturaleza */}
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
                        <SelectItem value="ACTIVO">Activo</SelectItem>
                        <SelectItem value="PASIVO">Pasivo</SelectItem>
                        <SelectItem value="PN">Patrimonio Neto</SelectItem>
                        <SelectItem value="INGRESO">Ingreso</SelectItem>
                        <SelectItem value="EGRESO">Egreso</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="naturaleza"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naturaleza</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DEUDORA">Deudora</SelectItem>
                        <SelectItem value="ACREEDORA">Acreedora</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Moneda */}
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
                      <SelectItem value="ARS">ARS — Pesos</SelectItem>
                      <SelectItem value="USD">USD — Dólares</SelectItem>
                      <SelectItem value="AMBAS">Ambas</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cuenta padre */}
            {parentOptions.length > 0 && (
              <FormField
                control={form.control}
                name="padreId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Cuenta padre{" "}
                      <span className="text-muted-foreground">(opcional)</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="— sin padre —" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">— sin padre —</SelectItem>
                        {parentOptions.map((c) => (
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
            )}

            {/* Permite movimientos + Activa */}
            <div className="flex gap-6">
              <FormField
                control={form.control}
                name="permiteMovimientos"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Permite movimientos</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="activa"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Activa</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Guardando…" : submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
