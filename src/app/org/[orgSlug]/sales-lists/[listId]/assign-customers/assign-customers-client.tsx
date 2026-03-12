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
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCustomers } from "@/modules/customers/hooks/use-customers";
import type { Customer } from "@/modules/customers/types";
import { useAssignCustomerMutation } from "@/modules/sales-price-lists/hooks/use-assign-customer-mutation";
import { createAssignColumns } from "./columns";

type AssignCustomersClientProps = {
  orgSlug: string;
  listId: string;
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

export function AssignCustomersClient({
  orgSlug,
  listId,
}: AssignCustomersClientProps) {
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: "is_active", value: ["active"] },
  ]);

  const assignMutation = useAssignCustomerMutation(orgSlug, listId);
  const { data: customerData = [] } = useCustomers(orgSlug, "all");

  const columns = useMemo(
    () =>
      createAssignColumns({
        orgSlug,
        listId,
        assignedIds,
        isPendingId: assignMutation.isPending
          ? (assignMutation.variables?.customerId ?? null)
          : null,
        onAssign: (customerId: string) => {
          assignMutation.mutate(
            { customerId },
            {
              onSuccess: () => {
                setAssignedIds((prev) => new Set(prev).add(customerId));
              },
            }
          );
        },
      }),
    [orgSlug, listId, assignedIds, assignMutation]
  );

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
    getRowId: (row) => row.id ?? `row-${row.fantasy_name || row.business_name}`,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

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
              No hay clientes disponibles para asignar a esta lista.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <DataTable table={table}>
      <DataTableToolbar
        globalFilterPlaceholder="Buscar por nombre, fantasía, localidad, CUIT o N° cliente..."
        table={table}
      />
    </DataTable>
  );
}
