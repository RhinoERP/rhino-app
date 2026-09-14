"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { VariantExpandedContent } from "@/components/products/variant-expanded-content";
import { Input } from "@/components/ui/input";
import { useDataTable } from "@/hooks/use-data-table";
import type { DistributorCatalogItem } from "@/modules/inventory/service/inventory.service";
import { createDistributorCatalogColumns } from "./columns";

type DistributorCatalogTableProps = {
  data: DistributorCatalogItem[];
  pageCount: number;
  orgSlug: string;
};

export function DistributorCatalogTable({
  data,
  pageCount,
  orgSlug,
}: DistributorCatalogTableProps) {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const columns = useMemo(() => createDistributorCatalogColumns(), []);

  const { table } = useDataTable<DistributorCatalogItem>({
    data,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
    },
    getRowId: (row) => row.product_id,
    getRowCanExpand: (row) => row.original.has_variants,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
  });

  return (
    <DataTable
      renderSubComponent={({ row }) =>
        row.original.has_variants ? (
          <VariantExpandedContent
            orgSlug={orgSlug}
            productId={row.original.product_id}
          />
        ) : null
      }
      table={table}
    >
      <div className="flex w-full items-center justify-between gap-2 p-1">
        <div className="relative">
          <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-8 w-48 pl-8 lg:w-72"
            onChange={(event) => {
              setSearch(event.target.value || null);
              table.setPageIndex(0);
            }}
            placeholder="Buscar por SKU o nombre..."
            value={search}
          />
        </div>
        <DataTableViewOptions align="end" table={table} />
      </div>
    </DataTable>
  );
}
