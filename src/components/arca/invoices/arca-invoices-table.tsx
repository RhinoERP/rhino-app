"use client";

import { FileTextIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { AuthorizedArcaInvoiceListItem } from "@/modules/arca/server/invoices.service";
import type { Option } from "@/types/data-table";
import { createArcaInvoiceColumns } from "./arca-invoice-columns";

type ArcaInvoicesTableProps = {
  orgSlug: string;
  invoices: AuthorizedArcaInvoiceListItem[];
};

function buildCustomerOptions(
  invoices: AuthorizedArcaInvoiceListItem[]
): Option[] {
  const customersMap = new Map<string, string>();

  for (const invoice of invoices) {
    const name =
      invoice.customer.fantasy_name ||
      invoice.customer.business_name ||
      "Cliente desconocido";
    customersMap.set(invoice.customer.id, name);
  }

  return Array.from(customersMap.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildSellerOptions(
  invoices: AuthorizedArcaInvoiceListItem[]
): Option[] {
  const sellersMap = new Map<string, string>();

  for (const invoice of invoices) {
    if (!invoice.seller?.id) {
      continue;
    }

    const label =
      invoice.seller.name || invoice.seller.email || "Vendedor sin nombre";
    sellersMap.set(invoice.seller.id, label);
  }

  return Array.from(sellersMap.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function ArcaInvoicesTable({
  orgSlug,
  invoices,
}: ArcaInvoicesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const customerOptions = useMemo(
    () => buildCustomerOptions(invoices),
    [invoices]
  );
  const sellerOptions = useMemo(() => buildSellerOptions(invoices), [invoices]);

  const columns = useMemo(
    () => createArcaInvoiceColumns(orgSlug, customerOptions, sellerOptions),
    [orgSlug, customerOptions, sellerOptions]
  );

  const table = useReactTable<AuthorizedArcaInvoiceListItem>({
    data: invoices,
    columns,
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
        pageSize: 20,
      },
      sorting: [
        {
          id: "arca_authorized_at",
          desc: true,
        },
      ],
    },
  });

  if (invoices.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay facturas emitidas</EmptyTitle>
            <EmptyDescription>
              Cuando la organización emita comprobantes fiscales en ARCA, van a
              aparecer listados aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar factura, cliente, CAE o punto de venta..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
