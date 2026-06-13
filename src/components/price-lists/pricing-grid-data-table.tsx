"use client";

import {
  CurrencyDollar,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnFiltersState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductPricingItem } from "@/modules/inventory/types";
import { createColumns } from "./pricing-grid-columns";

type PricingGridDataTableProps = {
  orgSlug: string;
  mode: "wholesale" | "direct";
};

export function PricingGridDataTable({
  orgSlug,
  mode,
}: PricingGridDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["pricing-grid", orgSlug, mode] as const,
    [orgSlug, mode]
  );
  const endpoint = mode === "wholesale" ? "venta-mayorista" : "venta-directa";

  const { data, isLoading } = useQuery<ProductPricingItem[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/org/${orgSlug}/precios/${endpoint}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al cargar datos");
      }
      return res.json();
    },
  });

  const onPriceUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const columns = useMemo(
    () => createColumns(orgSlug, mode, onPriceUpdated),
    [orgSlug, mode, onPriceUpdated]
  );

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: {
      globalFilter,
      columnFilters,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.product_id,
    autoResetPageIndex: false,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  const isFiltered = columnFilters.length > 0 || globalFilter.length > 0;

  const title = mode === "wholesale" ? "Venta mayorista" : "Venta directa";
  const description =
    mode === "wholesale"
      ? "Gestioná los precios de venta mayorista. Editá el precio para recalcular el margen automáticamente."
      : "Gestioná los precios de venta directa. Editá el precio para asignar un precio fijo para el canal POS.";

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-1 h-4 w-72" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CurrencyDollar className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <DataTable table={table}>
        <div
          aria-orientation="horizontal"
          className="flex w-full items-start justify-between gap-2 p-1"
          role="toolbar"
        >
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-8 w-48 pl-8 lg:w-72"
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder="Buscar por SKU o nombre..."
                value={globalFilter}
              />
            </div>
            {isFiltered && (
              <Button
                aria-label="Limpiar filtros"
                className="border-dashed"
                onClick={() => {
                  setGlobalFilter("");
                  setColumnFilters([]);
                }}
                size="sm"
                variant="outline"
              >
                <XIcon />
                Limpiar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DataTableViewOptions align="end" table={table} />
          </div>
        </div>
      </DataTable>
    </div>
  );
}
