"use client";

import {
  ArrowsDownUpIcon,
  DotsThreeOutlineVerticalIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CreateRoleSheet } from "@/components/organization/create-role-sheet";
import { ViewRolePermissionsSheet } from "@/components/organization/view-role-permissions-sheet";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteRoleAction } from "@/modules/organizations/actions/delete-role.action";
import type {
  OrganizationRole,
  Permission,
} from "@/modules/organizations/service/roles.service";

export function createColumns(
  orgSlug: string,
  permissions: Permission[]
): ColumnDef<OrganizationRole>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          className="px-0 text-left"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          type="button"
          variant="ghost"
        >
          Nombre
          <ArrowsDownUpIcon className="ml-2 size-4" weight="bold" />
        </Button>
      ),
    },
    {
      accessorKey: "key",
      header: "Clave",
      cell: ({ row }) => {
        const key = row.original.key;

        return (
          <Badge className="font-mono text-xs uppercase" variant="outline">
            {key}
          </Badge>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ row }) => {
        const description = row.original.description;

        return description || "Sin descripción";
      },
    },
    {
      accessorKey: "memberCount",
      header: "Miembros",
      cell: ({ row }) => {
        const count = row.original.memberCount;

        return (
          <span className="text-muted-foreground text-sm">
            {count} {count === 1 ? "miembro" : "miembros"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableHiding: false,
      cell: ({ row }) => (
        <RoleActionsCell
          orgSlug={orgSlug}
          permissions={permissions}
          role={row.original}
        />
      ),
    },
  ];
}

function RoleActionsCell({
  role,
  orgSlug,
  permissions,
}: {
  role: OrganizationRole;
  orgSlug: string;
  permissions: Permission[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [viewPermissionsSheetOpen, setViewPermissionsSheetOpen] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role.key === "admin";

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteRoleAction({
          orgSlug,
          roleId: role.id,
        });

        if (result.success) {
          setDeleteDialogOpen(false);
          router.refresh();
        } else {
          setError(result.error || "Error al eliminar el rol");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Error desconocido al eliminar el rol"
        );
      }
    });
  };

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Acciones" size="icon" variant="ghost">
              <DotsThreeOutlineVerticalIcon weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={isAdmin}
              onClick={() => setEditSheetOpen(true)}
            >
              <PencilIcon className="mr-2 size-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setViewPermissionsSheetOpen(true)}>
              <EyeIcon className="mr-2 size-4" />
              Ver permisos
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isAdmin || isPending}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <TrashIcon className="mr-2 size-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar rol?</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el rol "{role.name}"? Esta
              acción no se puede deshacer.
              {role.memberCount > 0 && (
                <span className="mt-2 block font-semibold text-destructive">
                  Este rol tiene {role.memberCount}{" "}
                  {role.memberCount === 1
                    ? "miembro asignado"
                    : "miembros asignados"}
                  . No se puede eliminar.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => setDeleteDialogOpen(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isPending || role.memberCount > 0}
              onClick={handleDelete}
              variant="destructive"
            >
              {isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateRoleSheet
        onOpenChange={setEditSheetOpen}
        open={editSheetOpen}
        orgSlug={orgSlug}
        permissions={permissions}
        role={role}
      />

      <ViewRolePermissionsSheet
        onOpenChange={setViewPermissionsSheetOpen}
        open={viewPermissionsSheetOpen}
        permissions={permissions}
        role={role}
      />
    </>
  );
}
