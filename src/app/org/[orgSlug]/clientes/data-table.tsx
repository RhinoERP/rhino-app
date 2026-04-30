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
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { useCustomers } from "@/modules/customers/hooks/use-customers";
import type { Customer } from "@/modules/customers/types";
import { useOrgSellers } from "@/modules/organizations/hooks/use-org-sellers";
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

  const { data: sellers = [] } = useOrgSellers(orgSlug);
  const { data: carriers = [] } = useCarriers(orgSlug);

  const sellersMap = useMemo(
    () => new Map(sellers.map((s) => [s.id, s.name])),
    [sellers]
  );

  const sellerOptions = useMemo(
    () => sellers.map((s) => ({ label: s.name, value: s.id })),
    [sellers]
  );

  const carriersMap = useMemo(
    () => new Map(carriers.map((c) => [c.id, c.name])),
    [carriers]
  );

  const carrierOptions = useMemo(
    () => carriers.map((c) => ({ label: c.name, value: c.id })),
    [carriers]
  );

  const columns = useMemo(
    () => createColumns(orgSlug, sellersMap, carriersMap),
    [orgSlug, sellersMap, carriersMap]
  );

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
    autoResetPageIndex: false,
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

  const filteredData = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);

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
            {sellerOptions.length > 0 && (
              <DataTableFacetedFilter
                column={table.getColumn("assigned_seller_id")}
                multiple
                options={sellerOptions}
                title="Vendedor"
              />
            )}
            {carrierOptions.length > 0 && (
              <DataTableFacetedFilter
                column={table.getColumn("preferred_carrier_id")}
                multiple
                options={carrierOptions}
                title="Transporte"
              />
            )}
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
