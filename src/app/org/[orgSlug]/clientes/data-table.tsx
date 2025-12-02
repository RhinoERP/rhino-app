"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Customer } from "@/modules/customers/types";
import { AddCustomerDialog } from "./add-customer-dialog";
import { createColumns } from "./columns";
import { CustomerDetailsDialog } from "./customer-details-dialog";

type DataTableProps = {
  data: Customer[];
  orgSlug: string;
};

export function CustomersDataTable({ data, orgSlug }: DataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const router = useRouter();

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailsDialogOpen(true);
  };

  const columns = createColumns(handleViewDetails);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    globalFilterFn: (row, _columnId, value) => {
      const customer = row.original as Customer;
      const searchValue = value.toLowerCase();

      // Search in fantasy_name, business_name, and cuit
      const fantasy_name = customer.fantasy_name?.toLowerCase() || "";
      const business_name = customer.business_name?.toLowerCase() || "";
      const cuit = customer.cuit?.toLowerCase() || "";

      return (
        fantasy_name.includes(searchValue) ||
        business_name.includes(searchValue) ||
        cuit.includes(searchValue)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row, index) => (row as { id?: string }).id ?? `row-${index}`,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // Precompute placeholder to avoid recreating component unnecessarily
  const searchPlaceholder = useMemo(() => "Buscar cliente o documento...", []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="max-w-sm"
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder={searchPlaceholder}
          value={globalFilter}
        />
        <AddCustomerDialog
          onCreated={() => {
            router.refresh();
            setGlobalFilter("");
          }}
          orgSlug={orgSlug}
        />
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

      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          Mostrando {table.getRowModel().rows.length} de{" "}
          {table.getFilteredRowModel().rows.length} registros
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {table.getPageCount() || 1}
          </span>
          <Button
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="sm"
            variant="outline"
          >
            Anterior
          </Button>
          <Button
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="sm"
            variant="outline"
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* Customer Details Dialog */}
      {selectedCustomer && (
        <CustomerDetailsDialog
          customer={selectedCustomer}
          onOpenChange={setIsDetailsDialogOpen}
          onUpdated={() => {
            router.refresh();
            setGlobalFilter("");
          }}
          open={isDetailsDialogOpen}
        />
      )}
    </div>
  );
}
