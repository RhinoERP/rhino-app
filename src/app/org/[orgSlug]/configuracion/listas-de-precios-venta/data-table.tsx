"use client";

import { ListBulletsIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { CreateSalesPriceListDialog } from "@/components/sales-price-lists/create-sales-price-list-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import { createSalesPriceListColumns } from "./columns";

type SalesPriceListsDataTableProps = {
  orgSlug: string;
};

export function SalesPriceListsDataTable({
  orgSlug,
}: SalesPriceListsDataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(
    () => createSalesPriceListColumns(orgSlug),
    [orgSlug]
  );

  const { data } = useSalesPriceLists(orgSlug);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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

            <EmptyTitle>No hay listas de precios de venta</EmptyTitle>
            <EmptyDescription>
              Crea tu primera lista de precios de venta para aplicar porcentajes
              a los productos.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateSalesPriceListDialog
              onSuccess={() => {
                router.refresh();
                setGlobalFilter("");
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
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por nombre o porcentaje..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
