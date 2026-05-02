"use client";

import { FilePdfIcon, ReceiptIcon } from "@phosphor-icons/react";
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";

type CreditNotesTableProps = {
  orgSlug: string;
  creditNotes: CreditNote[];
};

function PDFButton({
  orgSlug,
  creditNoteId,
}: {
  orgSlug: string;
  creditNoteId: string;
}) {
  const { generatePDF, isGenerating } = useCreditNotePDF({
    orgSlug,
    creditNoteId,
  });
  return (
    <Button
      disabled={isGenerating}
      onClick={generatePDF}
      size="sm"
      variant="ghost"
    >
      <FilePdfIcon className="size-4" weight="duotone" />
    </Button>
  );
}

export function CreditNotesTable({
  orgSlug,
  creditNotes,
}: CreditNotesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<CreditNote>[]>(
    () => [
      {
        accessorKey: "creditNoteNumber",
        header: "Número",
        cell: ({ row }) => (
          <Link
            className="font-mono text-sm hover:underline"
            href={`/org/${orgSlug}/notas-de-credito/${row.original.id}`}
          >
            {row.original.creditNoteNumber ?? row.original.id.slice(0, 8)}
          </Link>
        ),
      },
      {
        accessorKey: "issueDate",
        header: "Fecha",
        cell: ({ row }) => formatDateOnly(row.original.issueDate),
      },
      {
        id: "customer",
        header: "Cliente",
        accessorFn: (row) =>
          row.customer?.fantasyName ?? row.customer?.businessName ?? "—",
        cell: ({ row }) => {
          const c = row.original.customer;
          if (!c) {
            return "—";
          }
          return (
            <div>
              <p className="font-medium text-sm">
                {c.fantasyName ?? c.businessName}
              </p>
              {c.fantasyName && c.fantasyName !== c.businessName && (
                <p className="text-muted-foreground text-xs">
                  {c.businessName}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "sale",
        header: "Venta ref.",
        accessorFn: (row) =>
          row.sale?.invoiceNumber ?? String(row.sale?.saleNumber ?? "—"),
        cell: ({ row }) => {
          const s = row.original.sale;
          if (!s) {
            return "—";
          }
          let saleLabel = "—";
          if (s.invoiceNumber) {
            saleLabel = s.invoiceNumber;
          } else if (s.saleNumber != null) {
            saleLabel = `N°${s.saleNumber}`;
          }
          return <span className="text-sm">{saleLabel}</span>;
        },
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => (
          <span className="font-medium">
            {formatCurrency(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: "invoiceType",
        header: "Tipo",
        cell: ({ row }) => {
          const labels: Record<string, string> = {
            FACTURA_A: "Factura A",
            FACTURA_B: "Factura B",
            FACTURA_C: "Factura C",
            FACTURA_E: "Factura E",
            NOTA_DE_VENTA: "N. de Venta",
          };
          return (
            <span className="text-muted-foreground text-sm">
              {labels[row.original.invoiceType] ?? row.original.invoiceType}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <PDFButton creditNoteId={row.original.id} orgSlug={orgSlug} />
        ),
      },
    ],
    [orgSlug]
  );

  const table = useReactTable<CreditNote>({
    data: creditNotes,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  if (creditNotes.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <ReceiptIcon
            className="size-8 text-muted-foreground"
            weight="duotone"
          />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No hay notas de crédito</EmptyTitle>
          <EmptyDescription>
            Las notas de crédito aparecerán aquí una vez que las crees.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        globalFilterPlaceholder="Buscar por cliente, número, comprobante..."
        table={table}
      />
      <DataTable table={table} />
    </div>
  );
}
