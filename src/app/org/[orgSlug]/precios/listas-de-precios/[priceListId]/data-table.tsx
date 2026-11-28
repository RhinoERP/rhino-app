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
import { EditItemDiscountsDialog } from "@/components/price-lists/edit-item-discounts-dialog";
import { formatCurrency } from "@/lib/format";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import type { PriceListItem } from "@/modules/price-lists/types";
import { HABITUAL_DISCOUNT_FIELDS } from "@/modules/purchases/utils/purchase-discounts";
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
    `/api/org/${orgSlug}/precios/listas-de-precios/${priceListId}/items`
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

  const { data: settings } = useOrgSettings(orgSlug);
  const enabled = settings?.purchase_discounts_enabled === true;
  const columns = useMemo(() => {
    const base = createPriceListItemColumns(enabled);
    if (!enabled) {
      return base;
    }
    return [
      ...base,
      {
        id: "list_price",
        header: "Precio de lista",
        cell: ({ row }: { row: { original: PriceListItem } }) =>
          formatCurrency(
            row.original.list_price ?? row.original.purchase_price ?? 0,
            row.original.currency
          ),
      },
      ...HABITUAL_DISCOUNT_FIELDS.map((field, index) => ({
        id: field,
        header: `Descuento ${index + 1}`,
        cell: ({ row }: { row: { original: PriceListItem } }) =>
          `${row.original[field] ?? 0}%`,
      })),
      {
        id: "discount_actions",
        header: "",
        cell: ({ row }: { row: { original: PriceListItem } }) => (
          <EditItemDiscountsDialog item={row.original} orgSlug={orgSlug} />
        ),
      },
    ];
  }, [enabled, orgSlug]);

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
