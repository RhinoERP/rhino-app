"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { toggleMemberStatusAction } from "@/modules/organizations/actions/toggle-member-status.action";
import { updateMemberRoleAction } from "@/modules/organizations/actions/update-member-role.action";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }

  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const combined = `${first}${second}`.trim();

  return combined ? combined.toUpperCase() : "?";
}

function RoleSelector({
  member,
  roles,
  orgSlug,
}: {
  member: OrganizationMember;
  roles: OrganizationRole[];
  orgSlug: string;
}) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (member.is_owner) {
    return (
      <Badge className="rounded-full" variant="default">
        {member.is_owner ? "Dueño" : member.role?.name || "Sin rol"}
      </Badge>
    );
  }

  const currentRoleId = member.role?.id || null;
  const defaultRoleId = roles.length > 0 ? roles[0].id : null;
  const selectedRoleId = currentRoleId || defaultRoleId;

  const handleRoleChange = async (newRoleId: string) => {
    if (newRoleId === currentRoleId) {
      return;
    }

    setError(null);
    setIsUpdating(true);

    try {
      const result = await updateMemberRoleAction({
        userId: member.user_id,
        orgSlug,
        roleId: newRoleId,
      });

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Error al actualizar el rol");
      }
    } catch {
      setError("Error al actualizar el rol");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!selectedRoleId) {
    return <Badge variant="secondary">{member.role?.name || "Sin rol"}</Badge>;
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        disabled={isUpdating}
        onValueChange={handleRoleChange}
        value={selectedRoleId}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue>
            {member.role?.name ||
              roles.find((r) => r.id === selectedRoleId)?.name ||
              "Seleccionar rol"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}

function MemberActions({
  member,
  orgSlug,
}: {
  member: OrganizationMember;
  orgSlug: string;
}) {
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = member.is_active ?? true;

  const handleToggleStatus = async () => {
    setError(null);
    setIsToggling(true);

    try {
      const result = await toggleMemberStatusAction({
        userId: member.user_id,
        orgSlug,
        isActive: !isActive,
      });

      if (result.success) {
        setShowDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Error al cambiar el estado del miembro");
      }
    } catch {
      setError("Error al cambiar el estado del miembro");
    } finally {
      setIsToggling(false);
    }
  };

  if (member.is_owner) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Abrir menú</span>
            <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isToggling}
            onSelect={() => setShowDialog(true)}
          >
            {isActive ? "Desactivar usuario" : "Activar usuario"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setShowDialog} open={showDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isActive ? "Desactivar usuario" : "Activar usuario"}
            </DialogTitle>
            <DialogDescription>
              {isActive
                ? `¿Estás seguro de que deseas desactivar a ${member.user?.name || member.user?.email || "este usuario"}? No podrá acceder a la organización hasta que sea reactivado.`
                : `¿Estás seguro de que deseas activar a ${member.user?.name || member.user?.email || "este usuario"}? Podrá acceder nuevamente a la organización.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={isToggling}
              onClick={() => setShowDialog(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isToggling} onClick={handleToggleStatus}>
              {(() => {
                if (isToggling) {
                  return "Procesando...";
                }
                if (isActive) {
                  return "Desactivar";
                }
                return "Activar";
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function createMembersColumns(
  roles: OrganizationRole[],
  orgSlug: string
): ColumnDef<OrganizationMember>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => {
        const name = row.user?.name || "Sin nombre";
        const email = row.user?.email || "Sin email";
        return `${name} ${email}`.toLowerCase();
      },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Nombre" />
      ),
      cell: ({ row }) => {
        const member = row.original;
        const name = member.user?.name || "Sin nombre";
        const initials = getInitials(name);

        return (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground text-sm">
                {member.user?.email || "Sin email"}
              </span>
            </div>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "role",
      header: "Rol",
      cell: ({ row }) => {
        const member = row.original;
        return <RoleSelector member={member} orgSlug={orgSlug} roles={roles} />;
      },
      enableHiding: false,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Miembro desde" />
      ),
      cell: ({ row }) => {
        const member = row.original;
        return formatDateTime(member.created_at);
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "status",
      header: "Estado",
      size: 5,
      cell: ({ row }) => {
        const member = row.original;
        const isActive = member.is_active ?? true;
        return (
          <Badge
            className="rounded-full"
            variant={isActive ? "default" : "secondary"}
          >
            {isActive ? "Activo" : "Desactivado"}
          </Badge>
        );
      },
      enableHiding: false,
    },
    {
      id: "actions",
      header: "",
      size: 5,
      cell: ({ row }) => {
        const member = row.original;
        return (
          <div className="flex justify-end">
            <MemberActions member={member} orgSlug={orgSlug} />
          </div>
        );
      },
      enableHiding: false,
    },
  ];
}
