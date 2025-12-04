"use client";

import type { Supplier } from "@/modules/proveedores/service/suppliers.service";
import { createSupplierColumns } from "./columns";
import { DataTable } from "./data-table";

type SuppliersTableProps = {
  orgSlug: string;
  suppliers: Supplier[];
};

export function SuppliersTable({ orgSlug, suppliers }: SuppliersTableProps) {
  // createSupplierColumns uses client hooks, so it must run in a client component.
  const columns = createSupplierColumns(orgSlug);

  return <DataTable columns={columns} data={suppliers} orgSlug={orgSlug} />;
}
