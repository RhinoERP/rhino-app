"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { Input } from "@/components/ui/input";
import type { Customer } from "@/modules/customers/types";
import { createColumns } from "./columns";

type DataTableProps = {
  data: Customer[];
  orgSlug: string;
};

export function CustomersDataTable({ data, orgSlug }: DataTableProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createColumns(orgSlug), [orgSlug]);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    globalFilterFn: (row, _columnId, value) => {
      const customer = row.original as Customer;
      const searchValue = value.toLowerCase();

      const fantasy_name = customer.fantasy_name?.toLowerCase() || "";
      const business_name = customer.business_name?.toLowerCase() || "";
      const cuit = customer.cuit?.toLowerCase() || "";
      const phone = customer.phone?.toLowerCase() || "";

      return (
        fantasy_name.includes(searchValue) ||
        business_name.includes(searchValue) ||
        cuit.includes(searchValue) ||
        phone.includes(searchValue)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) =>
      (row as { id?: string }).id ??
      `row-${row.fantasy_name || row.business_name}`,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center justify-between gap-2">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Buscar por nombre, documento o teléfono..."
              value={globalFilter}
            />
          </div>
          <AddCustomerDialog
            onCreated={() => {
              router.refresh();
              setGlobalFilter("");
            }}
            orgSlug={orgSlug}
          />
        </div>
      </div>

      <DataTable table={table} />
    </div>
  );
}
