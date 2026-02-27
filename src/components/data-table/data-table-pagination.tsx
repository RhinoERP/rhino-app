"use client";

import type { Table } from "@tanstack/react-table";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";

const PAGE_SIZE_STORAGE_KEY = "rhino:data-table:page-size";
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

interface DataTablePaginationProps<TData> extends React.ComponentProps<"div"> {
  table: Table<TData>;
  pageSizeOptions?: number[];
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
  ...props
}: DataTablePaginationProps<TData>) {
  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      if (!storedValue) {
        return;
      }

      const storedPageSize = Number(storedValue);
      if (!Number.isFinite(storedPageSize)) {
        return;
      }

      if (!pageSizeOptions.includes(storedPageSize)) {
        return;
      }

      if (table.getState().pagination.pageSize !== storedPageSize) {
        table.setPageSize(storedPageSize);
      }
    } catch {
      // Ignore storage read errors (private mode, disabled storage, etc.).
    }
  }, [table, pageSizeOptions]);

  const handlePageSizeChange = (value: string) => {
    const pageSize = Number(value);
    table.setPageSize(pageSize);

    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, value);
    } catch {
      // Ignore storage write errors (private mode, disabled storage, etc.).
    }
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-8",
        className,
      )}
      {...props}
    >
      <div className="flex-1 whitespace-nowrap text-muted-foreground text-sm">
        {table.getFilteredSelectedRowModel().rows.length} de{" "}
        {table.getFilteredRowModel().rows.length} registros seleccionados.
      </div>
      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap font-medium text-sm">
            Registros por página
          </p>
          <Select onValueChange={handlePageSizeChange} value={`${table.getState().pagination.pageSize}`}>
            <SelectTrigger className="h-8 w-18 data-size:h-8">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center font-medium text-sm">
          Página {table.getState().pagination.pageIndex + 1} de{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            aria-label="Ir a la primera página"
            className="hidden size-8 lg:flex"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            size="icon"
            variant="outline"
          >
            <CaretDoubleLeftIcon weight="bold" />
          </Button>
          <Button
            aria-label="Ir a la página anterior"
            className="size-8"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="icon"
            variant="outline"
          >
            <CaretLeftIcon weight="bold" />
          </Button>
          <Button
            aria-label="Ir a la página siguiente"
            className="size-8"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="icon"
            variant="outline"
          >
            <CaretRightIcon weight="bold" />
          </Button>
          <Button
            aria-label="Ir a la última página"
            className="hidden size-8 lg:flex"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            size="icon"
            variant="outline"
          >
            <CaretDoubleRightIcon weight="bold" />
          </Button>
        </div>
      </div>
    </div>
  );
}
