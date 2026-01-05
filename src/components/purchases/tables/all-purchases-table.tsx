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
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import { createAllPurchasesColumns } from "../columns/purchase-columns-all";

type AllPurchasesTableProps = {
  orgSlug: string;
  purchases: PurchaseOrderWithSupplier[];
};

export function AllPurchasesTable({
  orgSlug,
  purchases,
}: AllPurchasesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  // Get unique suppliers from purchases data for filter options
  const supplierOptions = useMemo(() => {
    const suppliersMap = new Map<string, string>();
    for (const purchase of purchases) {
      if (purchase.supplier?.id && purchase.supplier?.name) {
        suppliersMap.set(purchase.supplier.id, purchase.supplier.name);
      }
    }
    return Array.from(suppliersMap.entries())
      .map(([id, name]) => ({ label: name, value: id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [purchases]);

  const columns = useMemo(
    () => createAllPurchasesColumns(orgSlug, supplierOptions),
    [orgSlug, supplierOptions]
  );

  const table = useReactTable<PurchaseOrderWithSupplier>({
    data: purchases,
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

  if (purchases.length === 0) {
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
        <DataTableToolbar globalFilterPlaceholder="Buscar..." table={table} />
      </DataTable>
    </div>
  );
}
