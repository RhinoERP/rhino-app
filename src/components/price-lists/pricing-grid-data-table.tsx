"use client";

import {
  CurrencyDollar,
  FileXls,
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
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductPricingItem } from "@/modules/inventory/types";
import {
  applySalesPriceListAdjustment,
  createColumns,
} from "./pricing-grid-columns";

type SalesPriceListOption = {
  id: string;
  name: string;
  type: string;
  value: number;
};

type PricingGridDataTableProps = {
  orgSlug: string;
  mode: "wholesale" | "direct";
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
};

const ACTIVE_FILTER = [
  { id: "is_active", value: ["active"] },
] as ColumnFiltersState;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportToExcel(
  rows: ProductPricingItem[],
  sheetName: string,
  filename: string,
  selectedList: SalesPriceListOption | null
) {
  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;

  const headers = ["Producto", "Precio de venta"];
  const data = rows.map((item) => {
    const basePrice = item.direct_sale_price ?? item.calculated_sale_price ?? 0;

    let price = basePrice;
    if (selectedList) {
      price = applySalesPriceListAdjustment(basePrice, selectedList);
    }

    return [item.name, price] as const;
  });

  const arrayData = [headers, ...data.map(([name, price]) => [name, price])];
  const ws = XLSX.utils.aoa_to_sheet(arrayData);

  const wscols = [{ wch: 50 }, { wch: 18 }];
  ws["!cols"] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${filename}.xlsx`);
}

export function PricingGridDataTable({
  orgSlug,
  mode,
  categories,
  suppliers,
}: PricingGridDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(ACTIVE_FILTER);
  const [selectedSalesPriceListId, setSelectedSalesPriceListId] =
    useState<string>("none");
  const [exporting, setExporting] = useState(false);

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

  const { data: salesPriceLists } = useQuery<SalesPriceListOption[]>({
    queryKey: ["sales-price-lists", orgSlug],
    queryFn: async () => {
      const res = await fetch(
        `/api/org/${orgSlug}/precios/listas-de-precios-venta`
      );
      if (!res.ok) {
        return [];
      }
      const lists = await res.json();
      return lists
        .filter((l: { status?: string }) => l.status === "Active")
        .map(
          (l: { id: string; name: string; type: string; value: number }) => ({
            id: l.id,
            name: l.name,
            type: l.type ?? "PERCENTAGE",
            value: l.value ?? 0,
          })
        );
    },
  });

  const selectedList = useMemo(() => {
    if (selectedSalesPriceListId === "none" || !salesPriceLists) {
      return null;
    }
    return (
      salesPriceLists.find((l) => l.id === selectedSalesPriceListId) ?? null
    );
  }, [selectedSalesPriceListId, salesPriceLists]);

  const onPriceUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const columns = useMemo(
    () =>
      createColumns(
        orgSlug,
        mode,
        onPriceUpdated,
        selectedList
          ? { type: selectedList.type, value: selectedList.value }
          : null
      ),
    [orgSlug, mode, onPriceUpdated, selectedList]
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
      columnVisibility: {
        category_name: false,
        is_active: false,
      },
    },
  });

  const isFiltered =
    columnFilters.some((f) => f.id !== "is_active") ||
    !columnFilters.some(
      (f) =>
        f.id === "is_active" &&
        Array.isArray(f.value) &&
        f.value.length === 1 &&
        f.value[0] === "active"
    ) ||
    globalFilter.length > 0;

  const handleDownload = async () => {
    if (!data) {
      return;
    }
    const filteredRows = table
      .getFilteredRowModel()
      .rows.map((r) => r.original);
    if (filteredRows.length === 0) {
      toast.error("No hay productos para exportar");
      return;
    }
    const sheetName = mode === "wholesale" ? "Mayorista" : "Venta directa";
    const prefix =
      mode === "wholesale"
        ? "lista-precios-mayorista"
        : "lista-precios-venta-directa";
    const dateStr = new Date().toISOString().split("T")[0];
    setExporting(true);
    try {
      await exportToExcel(
        filteredRows,
        sheetName,
        `${prefix}-${dateStr}`,
        selectedList
      );
    } catch {
      toast.error("Error al exportar");
    } finally {
      setExporting(false);
    }
  };

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: c.name, value: c.name })),
    [categories]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ label: s.name, value: s.name })),
    [suppliers]
  );

  const statusOptions = useMemo(
    () => [
      { label: "Activos", value: "active" },
      { label: "Inactivos", value: "inactive" },
    ],
    []
  );

  const title = mode === "wholesale" ? "Venta mayorista" : "Venta directa";
  const description =
    mode === "wholesale"
      ? "Gestioná los precios de venta mayorista."
      : "Gestioná los precios de venta directa.";

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
            <DataTableFacetedFilter
              column={table.getColumn("category_name")}
              multiple
              options={categoryOptions}
              title="Categoría"
            />
            <DataTableFacetedFilter
              column={table.getColumn("supplier_name")}
              multiple
              options={supplierOptions}
              title="Proveedor"
            />
            <DataTableFacetedFilter
              column={table.getColumn("is_active")}
              multiple
              options={statusOptions}
              title="Estado"
            />
            {isFiltered && (
              <Button
                aria-label="Limpiar filtros"
                className="border-dashed"
                onClick={() => {
                  setGlobalFilter("");
                  setColumnFilters(ACTIVE_FILTER);
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
            <Select
              onValueChange={setSelectedSalesPriceListId}
              value={selectedSalesPriceListId}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Aplicar lista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin lista</SelectItem>
                {salesPriceLists?.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label="Descargar"
              disabled={exporting}
              onClick={handleDownload}
              size="sm"
              variant="outline"
            >
              <FileXls />
              {exporting ? "Exportando..." : "Descargar"}
            </Button>
            <DataTableViewOptions align="end" table={table} />
          </div>
        </div>
      </DataTable>
    </div>
  );
}
