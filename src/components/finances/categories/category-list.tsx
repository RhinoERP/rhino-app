"use client";

import { PencilSimpleIcon, TagIcon, TrashIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
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

  const handleEdit = (cat: ExpenseCategory) => {
    setEditTarget(cat);
    setDialogOpen(true);
  };

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

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {categories.length} categoría{categories.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={handleNewClick} size="sm">
          <PlusIcon className="mr-1.5 size-4" weight="bold" />
          Nueva categoría
        </Button>
      </div>

      {categories.length === 0 ? (
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
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tipo
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr
                  className="border-b last:border-0 hover:bg-muted/20"
                  key={cat.id}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {cat.color && (
                        <span
                          className="inline-block size-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      <span className="font-medium">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {cat.is_fixed ? "Fijo" : "Variable"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        onClick={() => handleEdit(cat)}
                        size="icon"
                        variant="ghost"
                      >
                        <PencilSimpleIcon className="size-4" />
                      </Button>
                      <Button
                        onClick={() => setToDelete(cat)}
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
