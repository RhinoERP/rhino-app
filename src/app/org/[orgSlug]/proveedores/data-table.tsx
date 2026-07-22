"use client";

import {
  HandshakeIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SuppliersExportButton } from "@/components/suppliers/suppliers-export-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useDataTable } from "@/hooks/use-data-table";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import { createSupplierColumns } from "./columns";

type SuppliersDataTableProps = {
  orgSlug: string;
  data: Supplier[];
  pageCount: number;
};

export function SuppliersDataTable({
  orgSlug,
  data,
  pageCount,
}: SuppliersDataTableProps) {
  const columns = useMemo(() => createSupplierColumns(orgSlug), [orgSlug]);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const { table } = useDataTable<Supplier>({
    data,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
    getRowId: (row) => (row as { id?: string }).id ?? `row-${row.name}`,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
  });

  if (data.length === 0 && !search) {
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
            <AddSupplierDialog orgSlug={orgSlug} />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          searchSlot={
            <>
              <div className="relative">
                <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-8 w-48 pl-8 lg:w-72"
                  onChange={(event) => {
                    setSearch(event.target.value || null);
                    table.setPageIndex(0);
                  }}
                  placeholder="Buscar nombre o CUIT..."
                  value={search}
                />
              </div>
              {search && (
                <Button
                  aria-label="Limpiar busqueda"
                  className="border-dashed"
                  onClick={() => {
                    setSearch(null);
                    table.setPageIndex(0);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <XIcon />
                  Limpiar
                </Button>
              )}
            </>
          }
          table={table}
        >
          <SuppliersExportButton orgSlug={orgSlug} table={table} />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
