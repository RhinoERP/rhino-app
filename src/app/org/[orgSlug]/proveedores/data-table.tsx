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
import { DataTable } from "@/components/data-table/data-table";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { Input } from "@/components/ui/input";
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
    globalFilterFn: (row, _columnId, value) => {
      const supplier = row.original as Supplier;
      const searchValue = value.toLowerCase();

      const name = supplier.name?.toLowerCase() || "";
      const cuit = supplier.cuit?.toLowerCase() || "";
      const phone = supplier.phone?.toLowerCase() || "";
      const contactName = supplier.contact_name?.toLowerCase() || "";

      return (
        name.includes(searchValue) ||
        cuit.includes(searchValue) ||
        phone.includes(searchValue) ||
        contactName.includes(searchValue)
      );
    },
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center justify-between gap-2">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlassIcon className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Buscar por nombre, CUIT, teléfono o contacto..."
              value={globalFilter}
            />
          </div>
          <AddSupplierDialog
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
