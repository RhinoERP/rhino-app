"use client";

import { BankIcon } from "@phosphor-icons/react";
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
import type { PayableAccount } from "@/modules/collections/types";
import { createPayableColumns } from "./collection-columns";

type PayablesTableProps = {
  orgSlug: string;
  payables: PayableAccount[];
};

export function PayablesTable({ orgSlug, payables }: PayablesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of payables) {
      if (account.supplier.id && account.supplier.name) {
        map.set(account.supplier.id, account.supplier.name);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [payables]);

  const columns = useMemo(
    () => createPayableColumns(orgSlug, supplierOptions),
    [orgSlug, supplierOptions]
  );

  const table = useReactTable<PayableAccount>({
    data: payables,
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

  if (payables.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BankIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin cuentas por pagar</EmptyTitle>
            <EmptyDescription>
              Aún no registras deudas con proveedores en esta organización.
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
          globalFilterPlaceholder="Buscar proveedor..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
