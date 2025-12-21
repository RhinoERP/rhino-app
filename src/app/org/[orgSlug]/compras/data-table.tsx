"use client";

import { ShoppingCartIcon } from "@phosphor-icons/react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePurchases } from "@/modules/purchases/hooks/use-purchases";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import { createPurchaseColumns } from "./columns";

type PurchasesDataTableProps = {
  orgSlug: string;
};

export function PurchasesDataTable({ orgSlug }: PurchasesDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createPurchaseColumns(orgSlug), [orgSlug]);

  const { data } = usePurchases(orgSlug);

  const table = useReactTable<PurchaseOrderWithSupplier>({
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
        pageSize: 20,
      },
    },
  });

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCartIcon className="size-6" weight="duotone" />
            </EmptyMedia>

            <EmptyTitle>No hay compras</EmptyTitle>
            <EmptyDescription>
              Aún no has registrado ninguna compra en esta organización.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar por proveedor o número de remito..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
