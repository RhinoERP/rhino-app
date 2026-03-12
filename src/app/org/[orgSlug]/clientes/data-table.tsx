"use client";

import { UsersIcon } from "@phosphor-icons/react";
import {
  type ColumnFiltersState,
  type FilterFn,
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
import type { Customer } from "@/modules/customers/types";
import { createColumns } from "./columns";

type DataTableProps = {
  orgSlug: string;
  customers?: Customer[];
};

const SEARCH_TERMS_SEPARATOR = /\s+/;

const normalizeSearchValue = (value: string | number | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const customerGlobalFilter: FilterFn<Customer> = (
  row,
  _columnId,
  filterValue
) => {
  const query = normalizeSearchValue(
    filterValue as string | number | null | undefined
  );

  if (!query) {
    return true;
  }

  const searchableText = normalizeSearchValue(
    [
      row.original.client_number,
      row.original.fantasy_name,
      row.original.business_name,
      row.original.cuit,
      row.original.city,
    ]
      .filter((value) => value != null)
      .join(" ")
  );

  return query
    .split(SEARCH_TERMS_SEPARATOR)
    .every((term) => searchableText.includes(term));
};

export function CustomersDataTable({ orgSlug, customers }: DataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: "is_active", value: ["active"] },
  ]);
  const columns = useMemo(() => createColumns(orgSlug), [orgSlug]);

  const { data } = useCustomers(orgSlug, "all");
  const customerData = customers ?? data;

  const table = useReactTable({
    data: customerData,
    columns,
    state: {
      globalFilter,
      columnFilters,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: customerGlobalFilter,
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
  }, [globalFilter, columnFilters, customerData]);

  if (customerData.length === 0) {
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
            globalFilterPlaceholder="Buscar por nombre, fantasía, localidad, CUIT o N° cliente..."
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
