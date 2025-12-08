"use client";

import { PlusIcon, ShieldIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { CreateRoleSheet } from "@/components/organization/create-role-sheet";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type {
  OrganizationRole,
  Permission,
} from "@/modules/organizations/service/roles.service";
import { createColumns } from "./columns";

type RolesDataTableProps = {
  data: OrganizationRole[];
  orgSlug: string;
  permissions: Permission[];
};

export function RolesDataTable({
  data,
  orgSlug,
  permissions,
}: RolesDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(
    () => createColumns(orgSlug, permissions),
    [orgSlug, permissions]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row, index) => (row as { id?: string }).id ?? `row-${index}`,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay roles</EmptyTitle>
            <EmptyDescription>
              Aún no has creado ningún rol en esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateRoleSheet orgSlug={orgSlug} permissions={permissions} />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por nombre o clave de rol..."
          showViewOptions={false}
          table={table}
        >
          <CreateRoleSheet
            orgSlug={orgSlug}
            permissions={permissions}
            trigger={
              <Button>
                <PlusIcon className="size-4" />
                Nuevo rol
              </Button>
            }
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
