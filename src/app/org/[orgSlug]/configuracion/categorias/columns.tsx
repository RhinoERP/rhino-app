"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, FolderIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { AddCategoryDialog } from "@/components/categories/add-category-dialog";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCategories } from "@/modules/categories/hooks/use-categories";
import { useCategoryMutations } from "@/modules/categories/hooks/use-categories-mutations";
import type { Category } from "@/modules/categories/types";

type CategoryActionsCellProps = {
  category: Category;
  orgSlug: string;
};

function CategoryActionsCell({ category, orgSlug }: CategoryActionsCellProps) {
  const { deleteCategory } = useCategoryMutations(orgSlug);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCategory.mutateAsync(category.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting category:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 w-8 p-0" variant="ghost">
              <span className="sr-only">Abrir menú</span>
              <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setShowEditDialog(true)}>
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setShowDeleteDialog(true)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showEditDialog && (
        <AddCategoryDialog
          category={category}
          onUpdated={() => setShowEditDialog(false)}
          orgSlug={orgSlug}
          trigger={<div />}
        />
      )}

      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará permanentemente la categoría "
              {category.name}
              ". Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDeleting}
              onClick={handleDelete}
              variant="destructive"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const createColumns = (orgSlug: string): ColumnDef<Category>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const category = row.original;
      return (
        <div className="flex items-center gap-2">
          <FolderIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{category.name}</span>
        </div>
      );
    },
    meta: {
      label: "Nombre",
      placeholder: "Buscar nombre...",
      variant: "text",
      icon: FolderIcon,
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "parent",
    accessorKey: "parent_id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Categoría Padre" />
    ),
    cell: ({ row }) => {
      const { data: categories } = useCategories(orgSlug);
      const parentCategory = useMemo(
        () => categories.find((cat) => cat.id === row.original.parent_id),
        [categories, row.original.parent_id]
      );

      if (!parentCategory) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <Badge className="font-normal" variant="secondary">
          {parentCategory.name}
        </Badge>
      );
    },
    meta: {
      label: "Categoría Padre",
      variant: "text",
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Fecha de Creación" />
    ),
    cell: ({ row }) => {
      const date = row.original.created_at;
      if (!date) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <span className="text-muted-foreground text-sm">
          {format(new Date(date), "dd 'de' MMMM, yyyy", { locale: es })}
        </span>
      );
    },
    meta: {
      label: "Fecha de Creación",
      variant: "text",
      icon: CalendarIcon,
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <CategoryActionsCell category={row.original} orgSlug={orgSlug} />
    ),
    enableHiding: false,
  },
];
