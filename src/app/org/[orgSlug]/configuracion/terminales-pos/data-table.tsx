"use client";

import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MonitorIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { AddPosTerminalDialog } from "@/components/pos-terminals/add-pos-terminal-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePosTerminals } from "@/modules/pos/hooks/use-pos-terminals";
import { columns } from "./columns";

type PosTerminalsDataTableProps = {
  orgSlug: string;
};

export function PosTerminalsDataTable({ orgSlug }: PosTerminalsDataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const memoizedColumns = useMemo(() => columns, []);
  const { data = [] } = usePosTerminals(orgSlug);

  const table = useReactTable({
    data,
    columns: memoizedColumns,
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
              <MonitorIcon className="size-6" />
            </EmptyMedia>
            <EmptyTitle>No hay terminales POS</EmptyTitle>
            <EmptyDescription>
              Crea la primera caja para poder abrir sesiones y registrar ventas
              directas.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddPosTerminalDialog
              onCreated={() => {
                router.refresh();
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
          globalFilterPlaceholder="Buscar terminales..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
