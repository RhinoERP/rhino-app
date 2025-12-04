"use client";

import { ArrowsDownUpIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";

function formatDate(dateString: string | null): string {
  if (!dateString) {
    return "-";
  }
  const date = new Date(dateString);
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

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

export const columns: ColumnDef<OrganizationMember>[] = [
  {
    id: "name",
    accessorFn: (row) => row.user?.name ?? "",
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
  },
  {
    id: "role",
    header: "Rol",
    cell: ({ row }) => {
      const member = row.original;
      return (
        <Badge variant="secondary">
          {member.is_owner ? "Dueño" : member.role?.name || "Sin rol"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <Button
        className="px-0 text-left"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
        variant="ghost"
      >
        Fecha
        <ArrowsDownUpIcon className="ml-2 size-4" weight="bold" />
      </Button>
    ),
    cell: ({ row }) => {
      const member = row.original;
      return formatDate(member.created_at);
    },
  },
];
