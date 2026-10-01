"use client";

import {
  CurrencyDollar,
  FileXls,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnFiltersState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/components/auth/permissions-provider";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
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
import {
  updateDirectMarginAction,
  updateDirectSalePriceAction,
  updateWholesaleMarginAction,
  updateWholesalePriceAction,
} from "@/modules/inventory/actions/pricing-grid.actions";
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

  const priced = rows.map((item) => {
    const base = item.direct_sale_price ?? item.calculated_sale_price ?? 0;
    return {
      ...item,
      finalPrice: selectedList
        ? applySalesPriceListAdjustment(base, selectedList)
        : base,
    };
  });

  const groups = new Map<string, typeof priced>();
  for (const item of priced) {
    const group = item.root_category_name ?? "Sin categoría";
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)?.push(item);
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === "Sin categoría") {
      return 1;
    }
    if (b === "Sin categoría") {
      return -1;
    }
    return a.localeCompare(b, "es");
  });

  const { sheetData } = buildGroupedSheetData(sortedGroups);

  const lastRow = sheetData.at(-1);
  if (lastRow && lastRow[0] === "" && lastRow[1] === "") {
    sheetData.pop();
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!freeze"] = "A2";
  ws["!cols"] = [{ wch: 50 }, { wch: 18 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${filename}.xlsx`);
}

function buildGroupedSheetData(
  sortedGroups: [string, (ProductPricingItem & { finalPrice: number })[]][]
): {
  sheetData: (string | number)[][];
} {
  const sheetData: (string | number)[][] = [["Producto", "Precio de venta"]];

  for (const [rootCategory, items] of sortedGroups) {
    sheetData.push([rootCategory, ""]);

    const subGroupMap = new Map<string, typeof items>();
    const directItems: typeof items = [];

    for (const item of items) {
      const subCat = item.sub_root_category_name;
      if (subCat) {
        if (!subGroupMap.has(subCat)) {
          subGroupMap.set(subCat, []);
        }
        subGroupMap.get(subCat)?.push(item);
      } else {
        directItems.push(item);
      }
    }

    const sortedSubCats = [...subGroupMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "es")
    );
    for (const [subCat, subItems] of sortedSubCats) {
      subItems.sort((a, b) => a.name.localeCompare(b.name, "es"));
      sheetData.push([`  ${subCat}`, ""]);
      for (const item of subItems) {
        sheetData.push([`    ${item.name}`, item.finalPrice]);
      }
    }

    directItems.sort((a, b) => a.name.localeCompare(b.name, "es"));
    for (const item of directItems) {
      sheetData.push([`  ${item.name}`, item.finalPrice]);
    }

    sheetData.push(["", ""]);
  }

  return { sheetData };
}

export function PricingGridDataTable({
  orgSlug,
  mode,
  categories,
}: PricingGridDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(ACTIVE_FILTER);
  const [selectedSalesPriceListId, setSelectedSalesPriceListId] =
    useState<string>("none");
  const [exporting, setExporting] = useState(false);

  const { can } = usePermissions();
  const canViewCost = can("columns.view_cost");
  const canViewMargin = can("columns.view_margin");

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

  const wholesalePriceMutation = useMutation({
    mutationFn: ({
      productId,
      newPrice,
    }: {
      productId: string;
      newPrice: number;
    }) => updateWholesalePriceAction(orgSlug, productId, newPrice),
    onMutate: async ({ productId, newPrice }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ProductPricingItem[]>(queryKey);
      queryClient.setQueryData<ProductPricingItem[]>(queryKey, (old) =>
        old?.map((item) => {
          if (item.product_id !== productId) {
            return item;
          }
          const costPrice = item.cost_price;
          if (costPrice != null && costPrice > 0) {
            const newMargin = (newPrice / costPrice - 1) * 100;
            return {
              ...item,
              calculated_sale_price: newPrice,
              profit_margin: newMargin,
            };
          }
          return item;
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Error al actualizar el precio");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const wholesaleMarginMutation = useMutation({
    mutationFn: ({
      productId,
      newMargin,
    }: {
      productId: string;
      newMargin: number;
    }) => updateWholesaleMarginAction(orgSlug, productId, newMargin),
    onMutate: async ({ productId, newMargin }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ProductPricingItem[]>(queryKey);
      queryClient.setQueryData<ProductPricingItem[]>(queryKey, (old) =>
        old?.map((item) => {
          if (item.product_id !== productId) {
            return item;
          }
          const costPrice = item.cost_price;
          if (costPrice != null && costPrice > 0) {
            const newPrice = costPrice * (1 + newMargin / 100);
            return {
              ...item,
              calculated_sale_price: newPrice,
              profit_margin: newMargin,
            };
          }
          return item;
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Error al actualizar el margen");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const directPriceMutation = useMutation({
    mutationFn: ({
      productId,
      price,
    }: {
      productId: string;
      price: number | null;
    }) => updateDirectSalePriceAction(orgSlug, productId, price),
    onMutate: async ({ productId, price }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ProductPricingItem[]>(queryKey);
      queryClient.setQueryData<ProductPricingItem[]>(queryKey, (old) =>
        old?.map((item) =>
          item.product_id === productId
            ? { ...item, direct_sale_price: price }
            : item
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Error al actualizar el precio");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const directMarginMutation = useMutation({
    mutationFn: ({
      productId,
      newMargin,
    }: {
      productId: string;
      newMargin: number;
    }) => updateDirectMarginAction(orgSlug, productId, newMargin),
    onMutate: async ({ productId, newMargin }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ProductPricingItem[]>(queryKey);
      queryClient.setQueryData<ProductPricingItem[]>(queryKey, (old) =>
        old?.map((item) => {
          if (item.product_id !== productId) {
            return item;
          }
          const costPrice = item.cost_price;
          if (costPrice != null && costPrice > 0) {
            const newPrice = costPrice * (1 + newMargin / 100);
            return { ...item, direct_sale_price: newPrice };
          }
          return item;
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Error al actualizar el margen");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const columns = useMemo(
    () =>
      createColumns({
        orgSlug,
        mode,
        canViewCost,
        canViewMargin,
        mutateWholesalePrice: (productId, newPrice) =>
          wholesalePriceMutation.mutateAsync({ productId, newPrice }),
        mutateWholesaleMargin: (productId, newMargin) =>
          wholesaleMarginMutation.mutateAsync({ productId, newMargin }),
        mutateDirectPrice: (productId, price) =>
          directPriceMutation.mutateAsync({ productId, price }),
        mutateDirectMargin: (productId, newMargin) =>
          directMarginMutation.mutateAsync({ productId, newMargin }),
        selectedSalesPriceList: selectedList
          ? {
              type: selectedList.type,
              value: selectedList.value,
            }
          : null,
      }),
    [
      orgSlug,
      mode,
      wholesalePriceMutation.mutateAsync,
      wholesaleMarginMutation.mutateAsync,
      directPriceMutation.mutateAsync,
      directMarginMutation.mutateAsync,
      selectedList,
      canViewCost,
      canViewMargin,
    ]
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
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <DataTableSkeleton
          columnCount={6}
          filterCount={3}
          rowCount={8}
          shrinkZero={false}
          withViewOptions
        />
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
