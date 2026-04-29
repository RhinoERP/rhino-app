"use client";

import {
  DownloadSimpleIcon,
  PencilSimpleIcon,
  ReceiptIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { downloadExpensesExport } from "@/lib/excel-utils";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { deleteExpenseAction } from "@/modules/finances/actions/manage-expenses.action";
import type { OrganizationExpense } from "@/modules/finances/types";
import { ExpenseCategoryBadge } from "./expense-category-badge";

const PM_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  deposito: "Depósito",
  tarjeta_de_credito: "Tarjeta crédito",
  tarjeta_de_debito: "Tarjeta débito",
  "e-cheq": "E-cheq",
};

type ExpenseListProps = {
  orgSlug: string;
  expenses: OrganizationExpense[];
};

export function ExpenseList({ orgSlug, expenses }: ExpenseListProps) {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<OrganizationExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    await downloadExpensesExport(expenses);
    setExporting(false);
  };

  const handleDelete = async () => {
    if (!toDelete) {
      return;
    }
    setIsDeleting(true);
    const result = await deleteExpenseAction(orgSlug, toDelete.id);
    setIsDeleting(false);
    if (result.success) {
      toast.success("Gasto eliminado");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setToDelete(null);
  };

  if (expenses.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin gastos registrados</EmptyTitle>
            <EmptyDescription>
              Registrá el primer gasto operativo del establecimiento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          disabled={exporting}
          onClick={handleExport}
          size="sm"
          variant="outline"
        >
          <DownloadSimpleIcon className="mr-1.5 size-4" weight="bold" />
          {exporting ? "Exportando..." : "Exportar"}
        </Button>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Fecha
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Descripción
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Categoría
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Método
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Monto
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr
                className="border-b last:border-0 hover:bg-muted/20"
                key={expense.id}
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateOnly(expense.expense_date)}
                </td>
                <td className="px-4 py-3 font-medium">{expense.description}</td>
                <td className="px-4 py-3">
                  <ExpenseCategoryBadge category={expense.category ?? null} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {expense.payment_method
                    ? (PM_LABELS[expense.payment_method] ??
                      expense.payment_method)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium font-mono text-red-600">
                  {formatCurrency(expense.amount)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="icon" variant="ghost">
                      <Link
                        href={`/org/${orgSlug}/finanzas/gastos/${expense.id}`}
                      >
                        <PencilSimpleIcon className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      onClick={() => setToDelete(expense)}
                      size="icon"
                      variant="ghost"
                    >
                      <TrashIcon className="size-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog
        onOpenChange={(v) => {
          if (!isDeleting) {
            setToDelete(v ? toDelete : null);
          }
        }}
        open={Boolean(toDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar "{toDelete?.description}"? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <Button
              disabled={isDeleting}
              onClick={handleDelete}
              variant="destructive"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
