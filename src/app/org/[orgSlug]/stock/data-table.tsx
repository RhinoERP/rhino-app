"use client";

import { MagnifyingGlassIcon, Package, XIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableActionBar } from "@/components/data-table/data-table-action-bar";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { StockMobileList } from "@/components/products/stock-mobile-list";
import { VariantExpandedContent } from "@/components/products/variant-expanded-content";
import { StockExportButton } from "@/components/stock/stock-export-button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useDataTable } from "@/hooks/use-data-table";
import type { StockItem } from "@/modules/inventory/types";
import { StockBulkActions } from "./bulk-actions";
import { createColumns } from "./columns";

type StockDataTableProps = {
  data: StockItem[];
  orgSlug: string;
  pageCount: number;
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
};

const STATUS_OPTIONS = [
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

export function StockDataTable({
  data,
  orgSlug,
  pageCount,
  categories,
  suppliers,
}: StockDataTableProps) {
  const [rowSelection, setRowSelection] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [categoria, setCategoria] = useQueryState(
    "categoria",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false }).withDefault("active")
  );

  const isFiltered = search || categoria || status !== "active";

  const columns = useMemo(() => createColumns(orgSlug), [orgSlug]);

  const { table } = useDataTable<StockItem>({
    data,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
      columnVisibility: {
        sale_price: false,
        profit_margin: false,
      },
    },
    getRowId: (row) => row.product_id,
    getRowCanExpand: (row) => row.original.has_variants,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
  });

  const onSearchChange = (value: string) => {
    setSearch(value || null);
    table.setPageIndex(0);
  };

  const onCategoryChange = (value: string) => {
    setCategoria(value || null);
    table.setPageIndex(0);
  };

  const onStatusChange = (value: string) => {
    setStatus(value);
    table.setPageIndex(0);
  };

  const onResetFilters = () => {
    setSearch(null);
    setCategoria(null);
    setStatus("active");
    table.setPageIndex(0);
  };

  const filteredItems = useMemo(
    () => table.getRowModel().rows.map((row) => row.original),
    [table]
  );

  // Mobile-specific handlers
  const selectedIds = useMemo(
    () => new Set(Object.keys(rowSelection)),
    [rowSelection]
  );

  const handleToggleSelection = (productId: string) => {
    setRowSelection((prev) => {
      const newSelection: Record<string, boolean> = { ...prev };
      if (newSelection[productId]) {
        delete newSelection[productId];
      } else {
        newSelection[productId] = true;
      }
      return newSelection;
    });
  };

  const handleSelectAll = () => {
    const newSelection: Record<string, boolean> = {};
    for (const item of filteredItems) {
      newSelection[item.product_id] = true;
    }
    setRowSelection(newSelection);
  };

  const handleClearSelection = () => {
    setRowSelection({});
  };

  if (data.length === 0 && !search) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay productos</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún producto a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddProductDialog
              categories={categories}
              orgSlug={orgSlug}
              suppliers={suppliers}
            />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile Search Bar - Only visible on mobile */}
      <div className="relative md:hidden">
        <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-10 w-full pl-8"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por SKU o nombre..."
          value={search}
        />
      </div>

      {/* Mobile Filters Button */}
      <div className="md:hidden">
        <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
          <SheetTrigger asChild>
            <Button className="w-full" variant="outline">
              Filtros
              {isFiltered && (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
                  !
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="h-[80vh]" side="bottom">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>
                Filtra los productos por categoría y estado
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              {categories.length > 0 && (
                <div>
                  <h4 className="mb-3 font-medium text-sm">Categoría</h4>
                  <Select
                    onValueChange={(v) => {
                      onCategoryChange(v === "__all__" ? "" : v);
                    }}
                    value={categoria || "__all__"}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Todas las categorías" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <h4 className="mb-3 font-medium text-sm">Estado</h4>
                <Select onValueChange={onStatusChange} value={status}>
                  <SelectTrigger className="w-full">
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
              </div>
              {isFiltered && (
                <Button
                  className="w-full"
                  onClick={() => {
                    onResetFilters();
                    setFiltersOpen(false);
                  }}
                  variant="outline"
                >
                  <XIcon />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop DataTable - Hidden on Mobile */}
      <div className="hidden md:block">
        <DataTable
          renderSubComponent={({ row }) => (
            <VariantExpandedContent
              orgSlug={orgSlug}
              productId={row.original.product_id}
            />
          )}
          table={table}
        >
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
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Buscar por SKU o nombre..."
                  value={search}
                />
              </div>
              {categories.length > 0 && (
                <Select
                  onValueChange={(v) =>
                    onCategoryChange(v === "__all__" ? "" : v)
                  }
                  value={categoria || "__all__"}
                >
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
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
            </div>
            <div className="flex items-center gap-2">
              <StockExportButton orgSlug={orgSlug} table={table} />
              <DataTableViewOptions align="end" table={table} />
            </div>
          </div>
        </DataTable>
      </div>

      {/* Mobile Card List - Hidden on Desktop */}
      <div className="block md:hidden">
        <StockMobileList
          EmptyStateAction={
            <AddProductDialog
              categories={categories}
              orgSlug={orgSlug}
              suppliers={suppliers}
            />
          }
          items={filteredItems}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onToggleSelection={handleToggleSelection}
          orgSlug={orgSlug}
          selectedIds={selectedIds}
        />
      </div>

      {/* Action Bar - Works for both views */}
      <DataTableActionBar table={table}>
        <StockBulkActions orgSlug={orgSlug} table={table} />
      </DataTableActionBar>
    </div>
  );
}
