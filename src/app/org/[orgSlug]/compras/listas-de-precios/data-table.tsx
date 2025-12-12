"use client";

import { ListBulletsIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ImportPriceListDialog } from "@/components/price-lists/import-price-list-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePriceLists } from "@/modules/price-lists/hooks/use-price-lists";
import type { PriceList } from "@/modules/price-lists/types";
import { createPriceListColumns } from "./columns";

type PriceListsDataTableProps = {
  orgSlug: string;
};

export function PriceListsDataTable({ orgSlug }: PriceListsDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createPriceListColumns(orgSlug), [orgSlug]);

  const { data } = usePriceLists(orgSlug);

  const table = useReactTable<PriceList>({
    data,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
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

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListBulletsIcon className="size-6" weight="duotone" />
            </EmptyMedia>

            <EmptyTitle>No hay listas de precios</EmptyTitle>
            <EmptyDescription>
              Aún no has importado ninguna lista de precios.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ImportPriceListDialog orgSlug={orgSlug} />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por nombre o proveedor..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
