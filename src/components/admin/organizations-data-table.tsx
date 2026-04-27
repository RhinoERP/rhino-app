"use client";

import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { Organization } from "@/modules/organizations/types";
import { DataTableToolbar } from "../data-table/data-table-toolbar";
import { columns } from "./columns";

type OrganizationsDataTableProps = {
  organizations: Organization[];
};

export function OrganizationsDataTable({
  organizations,
}: OrganizationsDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable<Organization>({
    data: organizations ?? [],
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id ?? `row-${row.name}`,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (!organizations || organizations.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No hay organizaciones</EmptyTitle>
            <EmptyDescription>
              Aún no se han creado organizaciones en la plataforma.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent />
        </Empty>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-md bg-white p-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por nombre o CUIT..."
          showViewOptions={false}
          table={table}
        />
      </DataTable>
    </div>
  );
}
