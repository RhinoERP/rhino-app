"use client";

import { UsersIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { CustomersMobileList } from "@/components/customers/customers-mobile-list";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableExportButton } from "@/components/data-table/data-table-export-button";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCustomers } from "@/modules/customers/hooks/use-customers";
import { createColumns } from "./columns";

type DataTableProps = {
  orgSlug: string;
};

export function CustomersDataTable({ orgSlug }: DataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createColumns(orgSlug), [orgSlug]);

  const { data } = useCustomers(orgSlug);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) =>
      (row as { id?: string }).id ??
      `row-${row.fantasy_name || row.business_name}`,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: table.getFilteredRowModel causes infinite re-renders
  const filteredData = useMemo(() => {
    const rows = table.getFilteredRowModel().rows;
    return rows.map((row) => row.original);
  }, [globalFilter, data]);

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon className="size-6" weight="duotone" />
            </EmptyMedia>

            <EmptyTitle>No hay clientes</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún cliente a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddCustomerDialog
              onCreated={() => {
                router.refresh();
              }}
              orgSlug={orgSlug}
            />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop DataTable - Hidden on Mobile */}
      <div className="hidden md:block">
        <DataTable table={table}>
          <DataTableToolbar
            globalFilterPlaceholder="Buscar por nombre o CUIT..."
            table={table}
          >
            <DataTableExportButton
              filename="clientes"
              sheetName="Clientes"
              table={table}
            />
          </DataTableToolbar>
        </DataTable>
      </div>

      {/* Mobile List - Hidden on Desktop */}
      <div className="block md:hidden">
        <CustomersMobileList
          customers={filteredData}
          EmptyStateAction={
            <AddCustomerDialog
              onCreated={() => {
                router.refresh();
              }}
              orgSlug={orgSlug}
            />
          }
          orgSlug={orgSlug}
        />
      </div>
    </div>
  );
}
