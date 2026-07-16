"use client";

import {
  FilePdfIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableExportButton } from "@/components/data-table/data-table-export-button";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

type CreditNotesDataTableProps = {
  orgSlug: string;
  data: CreditNote[];
  pageCount: number;
};

const ARCA_STATUS_LABELS: Record<string, string> = {
  not_requested: "No emitida",
  pending: "Emitiendo",
  authorized: "Emitida",
  error: "Error",
};

const ARCA_STATUS_BADGE_CLASS_NAMES: Record<string, string> = {
  not_requested: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  authorized: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
};

const ORIGIN_LABELS: Record<string, string> = {
  RETURN: "Devolución",
  PURCHASE_TARGET: "Objetivo",
  MANUAL_ADJUSTMENT: "Manual",
  OTHER: "Otro",
};

function formatArcaNumber(
  pointOfSale: number | null,
  voucherNumber: number | null
): string | null {
  if (!(pointOfSale && voucherNumber)) {
    return null;
  }
  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

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

export function CreditNotesDataTable({
  orgSlug,
  data,
  pageCount,
}: CreditNotesDataTableProps) {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withOptions({ shallow: false }).withDefault(1)
  );

  const onSearchChange = useCallback(
    (value: string) => {
      setSearch(value || null);
      setPage(1);
    },
    [setSearch, setPage]
  );

  const columns = useMemo<
    import("@tanstack/react-table").ColumnDef<CreditNote>[]
  >(
    () => [
      {
        accessorKey: "creditNoteNumber",
        header: "Número",
        cell: ({ row }) => {
          const fiscalNumber = formatArcaNumber(
            row.original.arcaPointOfSale,
            row.original.arcaVoucherNumber
          );
          return (
            <Link
              className="font-mono text-sm hover:underline"
              href={`/org/${orgSlug}/notas-de-credito/${row.original.id}`}
            >
              {fiscalNumber ??
                row.original.creditNoteNumber ??
                row.original.id.slice(0, 8)}
            </Link>
          );
        },
      },
      {
        accessorKey: "arcaStatus",
        header: "ARCA",
        cell: ({ row }) => (
          <Badge
            className={cn(
              "border",
              ARCA_STATUS_BADGE_CLASS_NAMES[row.original.arcaStatus]
            )}
            variant="outline"
          >
            {ARCA_STATUS_LABELS[row.original.arcaStatus]}
          </Badge>
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
        accessorKey: "originType",
        header: "Origen",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {ORIGIN_LABELS[row.original.originType] ?? row.original.originType}
          </span>
        ),
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
            ...INVOICE_TYPE_LABELS,
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

  const { table } = useDataTable<CreditNote>({
    data,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
    },
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
  });

  if (data.length === 0 && !search) {
    return (
      <div className="rounded-md border">
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <div className="relative">
            <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-48 pl-8 lg:w-72"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar por cliente, número..."
              value={search}
            />
          </div>
          {search && (
            <Button
              aria-label="Limpiar busqueda"
              className="border-dashed"
              onClick={() => onSearchChange("")}
              size="sm"
              variant="outline"
            >
              <XIcon />
              Limpiar
            </Button>
          )}
          <DataTableExportButton
            filename="notas-de-credito"
            sheetName="Notas de Credito"
            table={table}
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
