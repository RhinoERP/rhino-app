"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import {
  createExpenseAction,
  updateExpenseAction,
} from "@/modules/finances/actions/manage-expenses.action";
import type {
  ExpenseCategory,
  OrganizationExpense,
} from "@/modules/finances/types";

const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "deposito", label: "Depósito" },
  { value: "tarjeta_de_credito", label: "Tarjeta de crédito" },
  { value: "tarjeta_de_debito", label: "Tarjeta de débito" },
  { value: "e-cheq", label: "E-cheq" },
] as const;

const schema = z.object({
  categoryId: z.string().nullable(),
  description: z.string().min(1, "La descripción es requerida"),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  expense_date: z.string().min(1, "La fecha es requerida"),
  payment_method: z.enum([
    "efectivo",
    "transferencia",
    "cheque",
    "deposito",
    "tarjeta_de_credito",
    "tarjeta_de_debito",
    "e-cheq",
  ]),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function getSubmitLabel(isSubmitting: boolean, isEditing: boolean): string {
  if (isSubmitting) {
    return isEditing ? "Guardando..." : "Registrando...";
  }
  return isEditing ? "Guardar cambios" : "Registrar gasto";
}

type ExpenseFormProps = {
  orgSlug: string;
  categories: ExpenseCategory[];
  expense?: OrganizationExpense;
};

export function ExpenseForm({
  orgSlug,
  categories,
  expense,
}: ExpenseFormProps) {
  const router = useRouter();
  const isEditing = Boolean(expense);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      categoryId: expense?.category_id ?? null,
      description: expense?.description ?? "",
      amount: expense?.amount ?? (0 as number),
      expense_date:
        expense?.expense_date ?? new Date().toISOString().split("T")[0],
      payment_method:
        (expense?.payment_method as FormValues["payment_method"]) ?? "efectivo",
      reference_number: expense?.reference_number ?? "",
      notes: expense?.notes ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    const result =
      isEditing && expense
        ? await updateExpenseAction(orgSlug, { id: expense.id, ...values })
        : await createExpenseAction(orgSlug, values);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(isEditing ? "Gasto actualizado" : "Gasto registrado");
    router.push(`/org/${orgSlug}/finanzas/gastos`);
    router.refresh();
  };

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Descripción *</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Alquiler mayo 2026" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto *</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    min={0}
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
            name="expense_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoría</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  value={field.value ?? "none"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.is_fixed ? " (Fijo)" : ""}
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
            name="payment_method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Método de pago *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
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
            name="reference_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de comprobante</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: REC-0001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Observaciones</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Notas adicionales..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button onClick={() => router.back()} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={form.formState.isSubmitting} type="submit">
            {getSubmitLabel(form.formState.isSubmitting, isEditing)}
          </Button>
        </div>
      </form>
    </Form>
  );
}
