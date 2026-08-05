"use client";

import { MagnifyingGlassIcon, ReceiptIcon, XIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef } from "react";
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
import { formatCurrency, formatDate } from "@/lib/format";
import {
  type SalesAdvanceListItem,
  type SalesAdvanceStatus,
  salesAdvanceStatuses,
  salesAdvanceStatusLabels,
} from "@/modules/sales-advances/types";

type Option = { id: string; name: string };

type SalesAdvancesDataTableProps = {
  orgSlug: string;
  data: SalesAdvanceListItem[];
  pageCount: number;
  customerOptions: Option[];
  sellerOptions: Option[];
};

const STATUS_CLASS_NAMES: Record<SalesAdvanceStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-700",
  ISSUE_SUBMITTED: "border-amber-200 bg-amber-50 text-amber-700",
  INVOICED: "border-blue-200 bg-blue-50 text-blue-700",
  PAID: "border-violet-200 bg-violet-50 text-violet-700",
  CLOSING: "border-amber-200 bg-amber-50 text-amber-700",
  FINAL_INVOICED: "border-blue-200 bg-blue-50 text-blue-700",
  CREDIT_NOTE_SUBMITTED: "border-amber-200 bg-amber-50 text-amber-700",
  CREDIT_AVAILABLE: "border-blue-200 bg-blue-50 text-blue-700",
  CREDIT_APPLIED: "border-violet-200 bg-violet-50 text-violet-700",
  SETTLED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  RECONCILIATION_REQUIRED: "border-red-200 bg-red-50 text-red-700",
  FAILED_RECOVERABLE: "border-red-200 bg-red-50 text-red-700",
};

function getSaleLabel(sale: SalesAdvanceListItem["finalSale"]) {
  if (sale.invoiceNumber) {
    return `Factura ${sale.invoiceNumber}`;
  }
  if (sale.saleNumber !== null) {
    return `Venta #${sale.saleNumber}`;
  }
  return "Ver venta";
}

function DocumentsCell({ advance }: { advance: SalesAdvanceListItem }) {
  const hasDocuments = Boolean(
    advance.advanceInvoiceNumber || advance.creditNoteNumber
  );
  return (
    <div className="text-muted-foreground text-xs">
      {advance.advanceInvoiceNumber ? (
        <p>
          FA {advance.advanceInvoiceNumber}
          {advance.advanceArcaCae ? ` · CAE ${advance.advanceArcaCae}` : ""}
        </p>
      ) : null}
      {advance.creditNoteNumber ? (
        <p>
          NC {advance.creditNoteNumber}
          {advance.creditNoteArcaCae
            ? ` · CAE ${advance.creditNoteArcaCae}`
            : ""}
        </p>
      ) : null}
      {hasDocuments ? null : "—"}
    </div>
  );
}

export function SalesAdvancesDataTable({
  orgSlug,
  data,
  pageCount,
  customerOptions,
  sellerOptions,
}: SalesAdvancesDataTableProps) {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withOptions({ shallow: false }).withDefault("ACTIVE")
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false })
  );
  const [customer, setCustomer] = useQueryState(
    "cliente",
    parseAsString.withOptions({ shallow: false })
  );
  const [seller, setSeller] = useQueryState(
    "vendedor",
    parseAsString.withOptions({ shallow: false })
  );
  const [createdAt, setCreatedAt] = useQueryState(
    "created_at",
    parseAsString.withOptions({ shallow: false })
  );
  const everHadData = useRef(false);
  if (data.length > 0) {
    everHadData.current = true;
  }

  const columns = useMemo<ColumnDef<SalesAdvanceListItem>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => {
          const value = row.original.status;
          return (
            <div className="space-y-1">
              <Badge className={STATUS_CLASS_NAMES[value]} variant="outline">
                {salesAdvanceStatusLabels[value]}
              </Badge>
              {row.original.lastError ? (
                <p
                  className="max-w-48 truncate text-destructive text-xs"
                  title={row.original.lastError}
                >
                  {row.original.lastError}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "sale",
        header: "Venta",
        accessorFn: (row) =>
          row.finalSale.saleNumber ?? row.finalSale.invoiceNumber ?? "",
        cell: ({ row }) => {
          const sale = row.original.finalSale;
          const label = getSaleLabel(sale);
          return (
            <div className="flex flex-col gap-1 text-sm">
              <Link
                className="font-medium hover:underline"
                href={`/org/${orgSlug}/ventas/${sale.id}`}
              >
                {label}
              </Link>
              <Link
                className="text-muted-foreground hover:underline"
                href={`/org/${orgSlug}/ventas/${sale.id}/anticipo`}
              >
                Gestionar anticipo
              </Link>
            </div>
          );
        },
      },
      {
        id: "customer",
        header: "Cliente",
        accessorFn: (row) =>
          row.customer?.fantasyName ?? row.customer?.businessName ?? "",
        cell: ({ row }) => (
          <div className="text-sm">
            <p className="font-medium">
              {row.original.customer?.fantasyName ??
                row.original.customer?.businessName ??
                "—"}
            </p>
            {row.original.seller?.name ? (
              <p className="text-muted-foreground text-xs">
                {row.original.seller.name}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Importe",
        cell: ({ row }) => (
          <span className="font-medium">
            {formatCurrency(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "finalBalance",
        header: "Saldo final",
        cell: ({ row }) => (
          <div className="text-sm">
            <p className="font-medium">
              {formatCurrency(row.original.finalBalance, row.original.currency)}
            </p>
            {row.original.finalBalanceEstimated ? (
              <p className="text-muted-foreground text-xs">Estimado</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "documents",
        header: "Comprobante",
        cell: ({ row }) => <DocumentsCell advance={row.original} />,
      },
      {
        accessorKey: "updatedAt",
        header: "Actualización",
        cell: ({ row }) =>
          formatDate(row.original.updatedAt, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const needsCollection = ["INVOICED", "CREDIT_APPLIED"].includes(
            row.original.status
          );
          return (
            <div className="flex flex-wrap gap-1">
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/org/${orgSlug}/ventas/${row.original.finalSale.id}/anticipo`}
                >
                  Gestionar
                </Link>
              </Button>
              {needsCollection ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/org/${orgSlug}/cobranzas`}>Cobranzas</Link>
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [orgSlug]
  );

  const { table } = useDataTable<SalesAdvanceListItem>({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });
  const hasFilters = Boolean(
    search || status || customer || seller || createdAt
  );

  const resetPage = () => table.setPageIndex(0);
  const setCreatedDate = (value: string) => {
    setCreatedAt(
      value
        ? `${new Date(`${value}T00:00:00`).getTime()},${new Date(`${value}T23:59:59`).getTime()}`
        : null
    );
    resetPage();
  };

  if (
    data.length === 0 &&
    view === "ACTIVE" &&
    !hasFilters &&
    !everHadData.current
  ) {
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
            <EmptyTitle>No hay anticipos activos</EmptyTitle>
            <EmptyDescription>
              Los anticipos creados desde una venta aparecerán aquí para su
              seguimiento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        onValueChange={(value) => {
          setView(value);
          resetPage();
        }}
        value={view}
      >
        <TabsList>
          <TabsTrigger value="ACTIVE">Activos</TabsTrigger>
          <TabsTrigger value="ALL">Todos</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable table={table}>
        <DataTableToolbar
          searchSlot={
            <>
              <div className="relative">
                <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-8 w-52 pl-8 lg:w-72"
                  onChange={(event) => {
                    setSearch(event.target.value || null);
                    resetPage();
                  }}
                  placeholder="Venta, cliente o comprobante..."
                  value={search}
                />
              </div>
              {search ? (
                <Button
                  aria-label="Limpiar búsqueda"
                  className="border-dashed"
                  onClick={() => {
                    setSearch(null);
                    resetPage();
                  }}
                  size="sm"
                  variant="outline"
                >
                  <XIcon />
                  Limpiar
                </Button>
              ) : null}
            </>
          }
          table={table}
        >
          <Select
            onValueChange={(value) => {
              setStatus(value === "all" ? null : value);
              resetPage();
            }}
            value={status ?? "all"}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {salesAdvanceStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {salesAdvanceStatusLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => {
              setCustomer(value === "all" ? null : value);
              resetPage();
            }}
            value={customer ?? "all"}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue placeholder="Todos los clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {customerOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => {
              setSeller(value === "all" ? null : value);
              resetPage();
            }}
            value={seller ?? "all"}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue placeholder="Todos los vendedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los vendedores</SelectItem>
              {sellerOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Fecha de creación"
            className="h-8 w-40"
            onChange={(event) => setCreatedDate(event.target.value)}
            type="date"
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
