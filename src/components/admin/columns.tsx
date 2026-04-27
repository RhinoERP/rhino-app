"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, CheckCircle, Lock } from "lucide-react";
import Link from "next/link";
import type { Organization } from "@/modules/organizations/types";

function formatDate(dateString: string | null): string {
  if (!dateString) {
    return "-";
  }
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-AR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "-";
  }
}

export const columns: ColumnDef<Organization>[] = [
  {
    accessorKey: "name",
    header: "Nombre",
    cell: ({ row }) => {
      const org = row.original;
      return (
        <Link
          className="font-medium hover:underline"
          href={`/admin/organizacion/${org.slug}`}
        >
          {org.name}
        </Link>
      );
    },
  },
  {
    accessorKey: "cuit",
    header: "CUIT",
    cell: ({ row }) => row.getValue("cuit") || "-",
  },
  {
    accessorKey: "slug",
    enableGlobalFilter: false,
    header: "Slug",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground text-sm">
        {row.getValue("slug") || "-"}
      </span>
    ),
  },
  {
    accessorKey: "created_at",
    enableGlobalFilter: false,
    header: () => (
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Fecha de creación
      </div>
    ),
    cell: ({ row }) => formatDate(row.getValue("created_at")),
  },
  {
    accessorKey: "is_active",
    enableGlobalFilter: false,
    header: "Estado",
    cell: ({ row }) => {
      const isActive = row.getValue("is_active");

      return (
        <div className="flex items-center gap-2">
          {isActive ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="font-medium text-green-600">Activa</p>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 text-destructive" />
              <p className="font-medium text-destructive">Deshabilitada</p>
            </>
          )}
        </div>
      );
    },
  },
];
