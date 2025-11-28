"use client";

import { Building2, Calendar } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrganizationsAction } from "@/modules/organizations/actions/get-organizations.action";
import type { Organization } from "@/modules/organizations/service/organizations.service";

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

export function OrganizationsList() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrganizationsAction();
      if (result.success) {
        setOrganizations(result.organizations);
      } else {
        setError(result.error || "Error al cargar las organizaciones");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();

    // Listen for organization creation event to refresh the list
    const handleOrganizationCreated = () => {
      fetchOrganizations();
    };

    window.addEventListener("organization-created", handleOrganizationCreated);

    return () => {
      window.removeEventListener(
        "organization-created",
        handleOrganizationCreated
      );
    };
  }, [fetchOrganizations]);

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-8 text-center">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h3 className="mb-2 font-semibold text-lg">Error</h3>
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    );
  }

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
