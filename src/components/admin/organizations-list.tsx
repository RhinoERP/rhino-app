"use client";

import { Building2, Calendar } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type OrganizationsListProps = {
  organizations: Organization[];
};

export function OrganizationsList({ organizations }: OrganizationsListProps) {
  if (organizations.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 font-semibold text-lg">No hay organizaciones</h3>
        <p className="text-muted-foreground text-sm">
          Aún no se han creado organizaciones en la plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>CUIT</TableHead>
            <TableHead className="hidden md:table-cell">Slug</TableHead>
            <TableHead className="hidden lg:table-cell">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Fecha de creación
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => (
            <TableRow key={org.id}>
              <TableCell className="font-medium">{org.name}</TableCell>
              <TableCell>{org.cuit || "-"}</TableCell>
              <TableCell className="hidden font-mono text-muted-foreground text-sm md:table-cell">
                {org.slug || "-"}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {formatDate(org.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
