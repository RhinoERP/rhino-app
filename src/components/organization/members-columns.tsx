"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
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
  ];
}
