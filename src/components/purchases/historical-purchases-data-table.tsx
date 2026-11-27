"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
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
import {
  historyAmount,
  historyClassification,
  historyDate,
  PURCHASE_HISTORY_TYPES,
  type PurchaseHistoryDocument,
  type PurchaseHistoryFilters,
} from "@/modules/purchases/historical/chess-history";
import { HistoricalPurchaseExportButton } from "./historical-purchase-export-button";

export function HistoricalPurchasesDataTable({
  orgSlug,
  data,
  pageCount,
  filters,
}: {
  orgSlug: string;
  data: PurchaseHistoryDocument[];
  pageCount: number;
  filters: PurchaseHistoryFilters;
}) {
  const columns = useMemo<ColumnDef<PurchaseHistoryDocument>[]>(
    () => [
      {
        accessorKey: "document_date",
        meta: { label: "Fecha" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        cell: ({ row }) => historyDate(row.original.document_date),
      },
      {
        accessorKey: "document_number",
        meta: { label: "Comprobante" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Comprobante" />
        ),
        cell: ({ row }) => (
          <Link
            className="font-medium text-primary hover:underline"
            href={`/org/${orgSlug}/compras/historicas/${row.original.id}`}
          >
            {row.original.printed_number}
          </Link>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Proveedor",
        meta: { label: "Proveedor" },
        enableSorting: false,
      },
      {
        id: "type",
        header: "Tipo",
        accessorFn: (doc) => PURCHASE_HISTORY_TYPES[doc.document_code],
        enableSorting: false,
      },
      {
        id: "classification",
        header: "Clasificación",
        accessorFn: historyClassification,
        enableSorting: false,
      },
      {
        id: "total",
        header: "Movimiento de deuda",
        accessorFn: (doc) => Math.abs(Number(doc.total_amount)) * doc.debt_sign,
        cell: ({ row }) =>
          historyAmount(
            Math.abs(Number(row.original.total_amount)) *
              row.original.debt_sign,
            row.original.currency
          ),
        enableSorting: false,
      },
      {
        id: "settlement",
        header: "Estado de cuenta",
        cell: () => "Sin conciliar",
        enableSorting: false,
      },
    ],
    [orgSlug]
  );
  const [pending, startTransition] = useTransition();
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    shallow: false,
    startTransition,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "document_date", desc: true }],
    },
  });
  const [query, setQuery] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      tipo: parseAsString,
      desde: parseAsString,
      hasta: parseAsString,
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, startTransition }
  );
  const [input, setInput] = useState(query.search);
  useEffect(() => setInput(query.search), [query.search]);
  useEffect(() => {
    if (input === query.search) {
      return;
    }
    const timer = window.setTimeout(
      () => setQuery({ search: input || null, page: 1 }),
      300
    );
    return () => window.clearTimeout(timer);
  }, [input, query.search, setQuery]);
  const hasFilters = Boolean(
    query.search || query.tipo || query.desde || query.hasta
  );
  return (
    <DataTable table={table}>
      <DataTableToolbar
        searchSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Buscar comprobante o proveedor"
              className="h-8 w-72"
              maxLength={100}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Buscar por comprobante o proveedor..."
              value={input}
            />
            <Select
              onValueChange={(value) =>
                setQuery({ tipo: value === "all" ? null : value, page: 1 })
              }
              value={query.tipo ?? "all"}
            >
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {Object.entries(PURCHASE_HISTORY_TYPES).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Input
              aria-label="Fecha desde"
              className="h-8 w-36"
              onChange={(event) =>
                setQuery({ desde: event.target.value || null, page: 1 })
              }
              type="date"
              value={query.desde ?? ""}
            />
            <Input
              aria-label="Fecha hasta"
              className="h-8 w-36"
              onChange={(event) =>
                setQuery({ hasta: event.target.value || null, page: 1 })
              }
              type="date"
              value={query.hasta ?? ""}
            />
            {hasFilters ? (
              <Button
                onClick={() => {
                  setInput("");
                  setQuery({
                    search: null,
                    tipo: null,
                    desde: null,
                    hasta: null,
                    page: 1,
                  });
                }}
                size="sm"
                variant="outline"
              >
                Limpiar
              </Button>
            ) : null}
          </div>
        }
        table={table}
      >
        <HistoricalPurchaseExportButton
          data={data}
          disabled={pending || input !== (filters.search ?? "")}
          filters={filters}
          orgSlug={orgSlug}
        />
      </DataTableToolbar>
    </DataTable>
  );
}
