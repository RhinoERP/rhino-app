"use client";

import { PencilSimpleIcon, TagIcon, TrashIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
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
import { deleteExpenseCategoryAction } from "@/modules/finances/actions/manage-expense-categories.action";
import type { ExpenseCategory } from "@/modules/finances/types";
import { CategoryDialog } from "./category-dialog";

type Props = {
  orgSlug: string;
  categories: ExpenseCategory[];
};

export function CategoryList({ orgSlug, categories }: Props) {
  const router = useRouter();
  const [editTarget, setEditTarget] = useState<ExpenseCategory | undefined>(
    undefined
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ExpenseCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEdit = useCallback((cat: ExpenseCategory) => {
    setEditTarget(cat);
    setDialogOpen(true);
  }, []);

  const handleNewClick = () => {
    setEditTarget(undefined);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!toDelete) {
      return;
    }
    setIsDeleting(true);
    const result = await deleteExpenseCategoryAction(orgSlug, toDelete.id);
    setIsDeleting(false);
    if (result.success) {
      toast.success("Categoría eliminada");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setToDelete(null);
  };

  const columns = useMemo<ColumnDef<ExpenseCategory>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.color && (
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.original.color }}
              />
            )}
            <span className="font-medium">{row.getValue("name")}</span>
          </div>
        ),
      },
      {
        accessorKey: "is_fixed",
        header: "Tipo",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.getValue<boolean>("is_fixed") ? "Fijo" : "Variable"}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              onClick={() => handleEdit(row.original)}
              size="icon"
              variant="ghost"
            >
              <PencilSimpleIcon className="size-4" />
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
    [handleEdit]
  );

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <>
      {categories.length === 0 ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleNewClick} size="sm">
              <PlusIcon className="mr-1.5 size-4" weight="bold" />
              Nueva categoría
            </Button>
          </div>
          <div className="rounded-md border">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TagIcon className="size-6" weight="duotone" />
                </EmptyMedia>
                <EmptyTitle>Sin categorías</EmptyTitle>
                <EmptyDescription>
                  Creá categorías para organizar y clasificar los gastos
                  operativos.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </div>
      ) : (
        <DataTable table={table}>
          <DataTableToolbar showViewOptions={false} table={table}>
            <Button onClick={handleNewClick} size="sm">
              <PlusIcon className="mr-1.5 size-4" weight="bold" />
              Nueva categoría
            </Button>
          </DataTableToolbar>
        </DataTable>
      )}

      <CategoryDialog
        category={editTarget}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) {
            setEditTarget(undefined);
          }
        }}
        open={dialogOpen}
        orgSlug={orgSlug}
      />

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
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar "{toDelete?.name}"? Esta acción no se puede deshacer.
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
