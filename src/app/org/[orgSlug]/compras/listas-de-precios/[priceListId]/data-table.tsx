"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableActionBar } from "@/components/data-table/data-table-action-bar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type { PriceListItem } from "@/modules/price-lists/types";
import { PriceListItemsBulkActions } from "./bulk-actions";
import { createPriceListItemColumns } from "./columns";

type PriceListItemsDataTableProps = {
  orgSlug: string;
  priceListId: string;
};

async function fetchPriceListItems(
  orgSlug: string,
  priceListId: string
): Promise<PriceListItem[]> {
  const response = await fetch(
    `/api/org/${orgSlug}/compras/listas-de-precios/${priceListId}/items`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch price list items");
  }

  const data = await response.json();
  return data;
}

export function PriceListItemsDataTable({
  orgSlug,
  priceListId,
}: PriceListItemsDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState({});

  const { data: items, isLoading } = useQuery({
    queryKey: ["price-list-items", orgSlug, priceListId],
    queryFn: () => fetchPriceListItems(orgSlug, priceListId),
  });

  const columns = useMemo(() => createPriceListItemColumns(), []);

  const table = useReactTable<PriceListItem>({
    data: items ?? [],
    columns,
    state: {
      globalFilter,
      rowSelection,
    },
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (isLoading) {
    return <DataTableSkeleton columnCount={5} rowCount={10} />;
  }

  return (
    <div className="space-y-4 p-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por SKU o producto..."
          table={table}
        />
      </DataTable>
      <DataTableActionBar table={table}>
        <PriceListItemsBulkActions
          orgSlug={orgSlug}
          priceListId={priceListId}
          table={table}
        />
      </DataTableActionBar>
    </div>
  );
}
