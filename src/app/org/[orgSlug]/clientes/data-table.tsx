"use client";

import { MagnifyingGlassIcon, UsersIcon, XIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef } from "react";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { ClientesExportButton } from "@/components/customers/clientes-export-button";
import { CustomersMobileList } from "@/components/customers/customers-mobile-list";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataTable } from "@/hooks/use-data-table";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import type { Customer } from "@/modules/customers/types";
import { useOrgSellers } from "@/modules/organizations/hooks/use-org-sellers";
import { createColumns } from "./columns";

type DataTableProps = {
  orgSlug: string;
  pageCount: number;
  customers?: Customer[];
};

const STATUS_OPTIONS = [
  { value: "active", label: "Activos" },
  { value: "archived", label: "Inactivos" },
];

export function CustomersDataTable({
  orgSlug,
  pageCount,
  customers = [],
}: DataTableProps) {
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false }).withDefault("active")
  );
  const [sellerId, setSellerId] = useQueryState(
    "sellerId",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const everHadData = useRef(false);
  if (customers.length > 0) {
    everHadData.current = true;
  }

  const isFiltered = status !== "active" || sellerId;

  const { data: sellers = [] } = useOrgSellers(orgSlug);
  const { data: carriers = [] } = useCarriers(orgSlug);

  const sellersMap = useMemo(
    () => new Map(sellers.map((s) => [s.id, s.name])),
    [sellers]
  );

  const sellersOptions = useMemo(
    () => sellers.map((s) => ({ label: s.name, value: s.id })),
    [sellers]
  );

  const carriersMap = useMemo(
    () => new Map(carriers.map((c) => [c.id, c.name])),
    [carriers]
  );

  const columns = useMemo(
    () => createColumns(orgSlug, sellersMap, carriersMap),
    [orgSlug, sellersMap, carriersMap]
  );

  const { table } = useDataTable<Customer>({
    data: customers,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
      columnVisibility: {
        phone: false,
        assigned_seller_id: false,
        preferred_carrier_id: false,
      },
    },
    getRowId: (row) =>
      (row as { id?: string }).id ??
      `row-${row.fantasy_name || row.business_name}`,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
  });

  const onStatusChange = (value: string) => {
    setStatus(value);
    table.setPageIndex(0);
  };

  const onSellerChange = (value: string) => {
    setSellerId(value || null);
    table.setPageIndex(0);
  };

  const onResetFilters = () => {
    setStatus("active");
    setSellerId(null);
    table.setPageIndex(0);
  };

  const filteredData = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);

  if (customers.length === 0 && !everHadData.current) {
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
                window.location.reload();
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
      <div className="hidden md:block">
        <DataTable table={table}>
          <DataTableToolbar
            searchSlot={
              <>
                <div className="relative">
                  <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="h-8 w-48 pl-8 lg:w-72"
                    onChange={(event) => {
                      setSearch(event.target.value || null);
                      table.setPageIndex(0);
                    }}
                    placeholder="Buscar por nombre, fantasía, CUIT..."
                    value={search}
                  />
                </div>
                {search && (
                  <Button
                    aria-label="Limpiar busqueda"
                    className="border-dashed"
                    onClick={() => {
                      setSearch(null);
                      table.setPageIndex(0);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <XIcon />
                    Limpiar
                  </Button>
                )}
              </>
            }
            table={table}
          >
            {sellersOptions.length > 0 && (
              <Select
                onValueChange={(v) => onSellerChange(v === "__all__" ? "" : v)}
                value={sellerId || "__all__"}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {sellersOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select onValueChange={onStatusChange} value={status}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isFiltered && (
              <Button
                aria-label="Reset filters"
                className="border-dashed"
                onClick={onResetFilters}
                size="sm"
                variant="outline"
              >
                <XIcon />
                Limpiar
              </Button>
            )}
            <ClientesExportButton orgSlug={orgSlug} table={table} />
          </DataTableToolbar>
        </DataTable>
      </div>

      <div className="block md:hidden">
        <CustomersMobileList
          customers={filteredData}
          EmptyStateAction={
            <AddCustomerDialog
              onCreated={() => {
                window.location.reload();
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
