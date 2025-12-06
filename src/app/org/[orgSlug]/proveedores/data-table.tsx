"use client";

import { HandshakeIcon } from "@phosphor-icons/react";
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
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import { createSupplierColumns } from "./columns";

type SuppliersDataTableProps = {
  data: Supplier[];
  orgSlug: string;
};

export function SuppliersDataTable({ data, orgSlug }: SuppliersDataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createSupplierColumns(orgSlug), [orgSlug]);

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
              <HandshakeIcon className="size-6" weight="duotone" />
            </EmptyMedia>

            <EmptyTitle>No hay proveedores</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún proveedor a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddSupplierDialog
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
          globalFilterPlaceholder="Buscar por nombre o CUIT..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
