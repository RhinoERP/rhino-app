"use client";

import { ListBulletsIcon, MagnifyingGlass } from "@phosphor-icons/react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { CreateSalesPriceListDialog } from "@/components/sales-price-lists/create-sales-price-list-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import { createSalesPriceListColumns } from "./columns";

type SalesPriceListsDataTableProps = {
  orgSlug: string;
};

export function SalesPriceListsDataTable({
  orgSlug,
}: SalesPriceListsDataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(
    () => createSalesPriceListColumns(orgSlug),
    [orgSlug]
  );

  const { data } = useSalesPriceLists(orgSlug);

  const filteredData = useMemo(() => {
    if (!globalFilter) {
      return data;
    }

    const lowerFilter = globalFilter.toLowerCase();
    return data.filter(
      (list) =>
        list.name.toLowerCase().includes(lowerFilter) ||
        list.percentage.toString().includes(lowerFilter)
    );
  }, [data, globalFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      globalFilter,
    },
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
            <CreateSalesPriceListDialog orgSlug={orgSlug} />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Buscar por nombre o porcentaje..."
            value={globalFilter}
          />
        </div>
        <CreateSalesPriceListDialog orgSlug={orgSlug} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={columns.length}
                >
                  No hay resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
