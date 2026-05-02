"use client";

import {
  DownloadSimpleIcon,
  PencilSimpleIcon,
  ReceiptIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
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
  const [globalFilter, setGlobalFilter] = useState("");
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

  const columns = useMemo<ColumnDef<OrganizationExpense>[]>(
    () => [
      {
        accessorKey: "expense_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateOnly(row.getValue("expense_date"))}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: "Descripción",
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-xs font-medium">
            {row.getValue("description")}
          </span>
        ),
      },
      {
        id: "category",
        accessorFn: (row) => row.category?.name ?? "",
        header: "Categoría",
        cell: ({ row }) => (
          <ExpenseCategoryBadge category={row.original.category ?? null} />
        ),
      },
      {
        accessorKey: "payment_method",
        header: "Método",
        cell: ({ row }) => {
          const pm = row.getValue<string | null>("payment_method");
          return (
            <span className="text-muted-foreground">
              {pm ? (PM_LABELS[pm] ?? pm) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end"
            column={column}
            label="Monto"
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium font-mono text-red-600">
            {formatCurrency(row.getValue("amount"))}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button asChild size="icon" variant="ghost">
              <Link href={`/org/${orgSlug}/finanzas/gastos/${row.original.id}`}>
                <PencilSimpleIcon className="size-4" />
              </Link>
            </Button>
            <Button
              onClick={() => setToDelete(row.original)}
              size="icon"
              variant="ghost"
            >
              <TrashIcon className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [orgSlug]
  );

  const table = useReactTable({
    data: expenses,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 25 } },
  });

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
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar gasto..."
          table={table}
        >
          <Button
            disabled={exporting}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <DownloadSimpleIcon className="mr-1.5 size-4" weight="bold" />
            {exporting ? "Exportando..." : "Exportar"}
          </Button>
        </DataTableToolbar>
      </DataTable>

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
