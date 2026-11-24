"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { HistoricalSalesExportButton } from "@/components/sales/historical-sales-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataTable } from "@/hooks/use-data-table";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type {
  ChessHistoricalSalesDocument,
  ChessHistoricalSalesExportFilters,
} from "@/modules/sales/historical/service/chess-historical-sales.service";

type HistoricalSalesDataTableProps = {
  orgSlug: string;
  data: ChessHistoricalSalesDocument[];
  pageCount: number;
  sort?: ChessHistoricalSalesExportFilters["sort"];
};

const DOCUMENT_TYPES = [
  { value: "FCVTA", label: "Factura" },
  { value: "PRVTA", label: "Remito / Nota de venta" },
  { value: "DVVTA", label: "Nota de crédito" },
  { value: "PRDVO", label: "Crédito de nota de venta" },
  { value: "NDCON", label: "Nota de débito" },
];

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
  });
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(value);
}

function customerName(document: ChessHistoricalSalesDocument) {
  return (
    document.customer?.fantasy_name ||
    document.customer?.business_name ||
    `Cliente CHESS ${document.customer_chess_code ?? "sin vincular"}`
  );
}

function documentClassLabel(document: ChessHistoricalSalesDocument) {
  let type = "Venta";
  if (document.document_class === "CREDIT_NOTE") {
    type = "Nota de crédito";
  } else if (document.document_class === "DEBIT_NOTE") {
    type = "Nota de débito";
  }
  return `${document.is_fiscal ? "Fiscal" : "No fiscal"} · ${type}`;
}

function settlementLabel(document: ChessHistoricalSalesDocument) {
  if (document.cancelled) {
    return "Anulado";
  }
  if (document.settlement_status === "PAID") {
    return "Pagado";
  }
  if (document.settlement_status === "OPEN") {
    return "Abierto";
  }
  if (document.settlement_status === "PARTIAL") {
    return "Parcial";
  }
  if (document.settlement_status === "NOT_APPLICABLE") {
    return "No aplica";
  }
  return "Saldo sin conciliar";
}

export function HistoricalSalesDataTable({
  orgSlug,
  data,
  pageCount,
  sort,
}: HistoricalSalesDataTableProps) {
  const columns = useMemo<ColumnDef<ChessHistoricalSalesDocument>[]>(
    () => [
      {
        accessorKey: "document_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        cell: ({ row }) => formatDate(row.original.document_date),
      },
      {
        accessorKey: "document_number",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Comprobante" />
        ),
        cell: ({ row }) => {
          const document = row.original;
          return (
            <div>
              <Link
                className="font-medium text-primary hover:underline"
                href={`/org/${orgSlug}/ventas/historicas/${document.id}`}
              >
                {document.printed_number ||
                  `${document.document_letter} ${document.document_series}-${document.document_number}`}
              </Link>
              <p className="text-muted-foreground text-xs">
                {document.document_code} · {document.document_name}
              </p>
            </div>
          );
        },
      },
      {
        id: "customer",
        accessorFn: customerName,
        header: "Cliente",
        enableSorting: false,
      },
      {
        id: "classification",
        accessorFn: documentClassLabel,
        header: "Clasificación",
        enableSorting: false,
      },
      {
        id: "signed_amount",
        accessorFn: (document) =>
          Number(document.total_amount) * document.revenue_sign,
        header: "Importe",
        cell: ({ row }) =>
          formatAmount(
            Number(row.original.total_amount) * row.original.revenue_sign
          ),
        enableSorting: false,
      },
      {
        id: "settlement_status",
        accessorFn: settlementLabel,
        header: "Estado de cuenta",
        enableSorting: false,
      },
    ],
    [orgSlug]
  );

  const { table } = useDataTable<ChessHistoricalSalesDocument>({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "document_date", desc: true }],
    },
  });

  const queryOptions = { shallow: false } as const;
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions(queryOptions).withDefault("")
  );
  const [documentCode, setDocumentCode] = useQueryState(
    "tipo",
    parseAsString.withOptions(queryOptions)
  );
  const [dateFrom, setDateFrom] = useQueryState(
    "desde",
    parseAsString.withOptions(queryOptions)
  );
  const [dateTo, setDateTo] = useQueryState(
    "hasta",
    parseAsString.withOptions(queryOptions)
  );
  const [inputValue, setInputValue] = useState(search);

  useEffect(() => setInputValue(search), [search]);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value || null);
    table.setPageIndex(0);
  }, 300);

  const clearFilters = () => {
    setSearch(null);
    setInputValue("");
    setDocumentCode(null);
    setDateFrom(null);
    setDateTo(null);
    table.setPageIndex(0);
  };

  const hasFilters = Boolean(search || documentCode || dateFrom || dateTo);

  return (
    <DataTable table={table}>
      <DataTableToolbar
        searchSlot={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-8 w-48 pl-8 lg:w-72"
                onChange={(event) => {
                  const value = event.target.value;
                  setInputValue(value);
                  debouncedSetSearch(value);
                }}
                placeholder="Buscar por comprobante o cliente..."
                value={inputValue}
              />
            </div>
            <HistoricalSalesExportButton
              filters={{
                search: search || undefined,
                documentCode: documentCode ?? undefined,
                dateFrom: dateFrom ?? undefined,
                dateTo: dateTo ?? undefined,
                sort,
              }}
              orgSlug={orgSlug}
              table={table}
            />
            {hasFilters ? (
              <Button
                className="border-dashed"
                onClick={clearFilters}
                size="sm"
                variant="outline"
              >
                <XIcon />
                Limpiar
              </Button>
            ) : null}
          </div>
        }
        table={table}
      >
        <Select
          onValueChange={(value) => {
            setDocumentCode(value === "all" ? null : value);
            table.setPageIndex(0);
          }}
          value={documentCode ?? "all"}
        >
          <SelectTrigger className="h-8 w-52">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Fecha desde"
          className="h-8 w-36"
          onChange={(event) => {
            setDateFrom(event.target.value || null);
            table.setPageIndex(0);
          }}
          type="date"
          value={dateFrom ?? ""}
        />
        <Input
          aria-label="Fecha hasta"
          className="h-8 w-36"
          onChange={(event) => {
            setDateTo(event.target.value || null);
            table.setPageIndex(0);
          }}
          type="date"
          value={dateTo ?? ""}
        />
      </DataTableToolbar>
    </DataTable>
  );
}
