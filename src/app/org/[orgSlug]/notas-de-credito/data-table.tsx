"use client";

import {
  FilePdfIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  XIcon,
} from "@phosphor-icons/react";
import { CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef } from "react";
import { CreditNotesExportButton } from "@/components/credit-notes/credit-notes-export-button";
import { DataTable } from "@/components/data-table/data-table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";
import type { Customer } from "@/modules/customers/types";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

type CreditNotesDataTableProps = {
  orgSlug: string;
  data: CreditNote[];
  pageCount: number;
  customers?: Customer[];
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
  customers = [],
}: CreditNotesDataTableProps) {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false })
  );
  const [cliente, setCliente] = useQueryState(
    "cliente",
    parseAsString.withOptions({ shallow: false })
  );

  const everHadData = useRef(false);
  if (data.length > 0) {
    everHadData.current = true;
  }

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

  if (data.length === 0 && !search && !everHadData.current) {
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
      <Tabs
        className="w-full"
        onValueChange={(value) => {
          setStatus(value === "ALL" ? null : value);
          table.setPageIndex(0);
        }}
        value={status ?? "ALL"}
      >
        <TabsList>
          <TabsTrigger value="ALL">Todas</TabsTrigger>
          <TabsTrigger value="CONFIRMED">
            <CheckCircle className="mr-1 h-4 w-4" />
            Confirmadas
          </TabsTrigger>
          <TabsTrigger value="CANCELLED">
            <XCircle className="mr-1 h-4 w-4" />
            Canceladas
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
                  placeholder="Buscar por número de nota..."
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
          {customers.length > 0 && (
            <Select
              onValueChange={(value) => {
                setCliente(value === "all" ? null : value);
                table.setPageIndex(0);
              }}
              value={cliente ?? "all"}
            >
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder="Todos los clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {customers.map((c) => {
                  const name =
                    (c as unknown as { fantasy_name?: string | null })
                      .fantasy_name ||
                    (c as unknown as { business_name?: string })
                      .business_name ||
                    c.id.slice(0, 8);
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          <CreditNotesExportButton orgSlug={orgSlug} table={table} />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
