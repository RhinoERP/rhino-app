"use client";

import { HandCoinsIcon } from "@phosphor-icons/react";
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
import type { ReceivableAccount } from "@/modules/collections/types";
import { createReceivableColumns } from "./collection-columns";

type ReceivablesTableProps = {
  orgSlug: string;
  receivables: ReceivableAccount[];
};

export function ReceivablesTable({
  orgSlug,
  receivables,
}: ReceivablesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of receivables) {
      if (account.customer.id) {
        const fantasy = account.customer.fantasy_name?.trim();
        const business = account.customer.business_name?.trim();
        const displayName =
          fantasy && business && fantasy !== business
            ? `${fantasy} (${business})`
            : fantasy || business;
        if (displayName) {
          map.set(account.customer.id, displayName);
        }
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [receivables]);

  const columns = useMemo(
    () => createReceivableColumns(orgSlug, customerOptions),
    [orgSlug, customerOptions]
  );

  const table = useReactTable<ReceivableAccount>({
    data: receivables,
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

  if (receivables.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoinsIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin cuentas por cobrar</EmptyTitle>
            <EmptyDescription>
              Aún no registras deudas de clientes en esta organización.
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
          globalFilterPlaceholder="Buscar cliente..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
