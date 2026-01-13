"use client";

import { PercentIcon } from "@phosphor-icons/react";
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
import { AddTaxDialog } from "@/components/taxes/add-tax-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useTaxes } from "@/modules/taxes/hooks/use-taxes";
import { createColumns } from "./columns";

type DataTableProps = {
  orgSlug: string;
};

export function TaxesDataTable({ orgSlug }: DataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createColumns(orgSlug), [orgSlug]);

  const { data = [] } = useTaxes(orgSlug);

  const table = useReactTable({
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
    getRowId: (row) => (row as { id?: string }).id ?? `row-${row.name}`,
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
              <PercentIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay impuestos</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún impuesto a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddTaxDialog
              onCreated={() => {
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
          globalFilterPlaceholder="Buscar impuestos..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
