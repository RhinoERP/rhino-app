"use client";

import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useRef } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { QuotesExportButton } from "@/components/quotes/quotes-export-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuoteWithCustomer } from "@/modules/quotes/actions/get-quotes.action";
import type { QuoteStatus } from "@/modules/quotes/types";
import { QuoteActionsCell } from "./quote-actions-cell";

type QuotesTableProps = {
  orgSlug: string;
  data: QuoteWithCustomer[];
  pageCount: number;
};

export const statusStyles: Record<
  QuoteStatus,
  {
    label: string;
    icon: typeof ClipboardTextIcon;
    className: string;
  }
> = {
  DRAFT: {
    label: "Borrador",
    icon: ClipboardTextIcon,
    className:
      "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/5",
  },
  SENT: {
    label: "Enviado",
    icon: PaperPlaneTiltIcon,
    className:
      "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400 dark:bg-blue-500/5",
  },
  APPROVED: {
    label: "Aprobado",
    icon: CheckCircleIcon,
    className:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-500/5",
  },
  REJECTED: {
    label: "Rechazado",
    icon: XCircleIcon,
    className:
      "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400 dark:bg-rose-500/5",
  },
  CONVERTED: {
    label: "Convertido",
    icon: ArrowSquareOutIcon,
    className:
      "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400 dark:bg-violet-500/5",
  },
  CANCELLED: {
    label: "Cancelado",
    icon: XCircleIcon,
    className:
      "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400 dark:bg-gray-500/5",
  },
};

type TabValue = "ALL" | QuoteStatus;

const tabs: {
  value: TabValue;
  label: string;
  icon: typeof ClipboardTextIcon;
  color: string;
}[] = [
  {
    color: "text-slate-500",
    label: "Todos",
    icon: ClipboardTextIcon,
    value: "ALL",
  },
  {
    color: "text-amber-500",
    label: "Borradores",
    icon: ClipboardTextIcon,
    value: "DRAFT",
  },
  {
    color: "text-blue-500",
    label: "Enviados",
    icon: PaperPlaneTiltIcon,
    value: "SENT",
  },
  {
    color: "text-green-500",
    label: "Aprobados",
    icon: CheckCircleIcon,
    value: "APPROVED",
  },
  {
    color: "text-rose-500",
    label: "Rechazados",
    icon: XCircleIcon,
    value: "REJECTED",
  },
  {
    color: "text-violet-500",
    label: "Convertidos",
    icon: ArrowSquareOutIcon,
    value: "CONVERTED",
  },
  {
    color: "text-gray-500",
    label: "Cancelados",
    icon: XCircleIcon,
    value: "CANCELLED",
  },
];

export function QuotesTable({ orgSlug, data, pageCount }: QuotesTableProps) {
  const everHadData = useRef(false);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [estado, setEstado] = useQueryState(
    "estado",
    parseAsString.withOptions({ shallow: false }).withDefault("ALL")
  );

  const handleRowClick = useCallback(
    (quoteId: string) => {
      window.location.href = `/org/${orgSlug}/presupuestos/${quoteId}/editar`;
    },
    [orgSlug]
  );

  const columns = useMemo<ColumnDef<QuoteWithCustomer>[]>(
    () => [
      {
        id: "customer",
        accessorFn: (row) =>
          row.customers?.fantasy_name || row.customers?.business_name || "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cliente" />
        ),
        size: 260,
        cell: ({ row }) => {
          const quote = row.original;
          const displayName =
            quote.customers?.fantasy_name ||
            quote.customers?.business_name ||
            "Cliente desconocido";

          return (
            <span className="block font-medium text-sm">{displayName}</span>
          );
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        size: 140,
        cell: ({ row }) => {
          const dateStr = row.original.created_at;
          if (!dateStr) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }
          return (
            <div className="text-muted-foreground text-sm">
              {formatDate(dateStr, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          );
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "items_count",
        accessorFn: (row) =>
          (row.quote_items ?? []).reduce(
            (sum, item) => sum + (item.quantity ?? 0),
            0
          ),
        header: ({ column }) => (
          <DataTableColumnHeader
            className="ml-auto justify-end text-right"
            column={column}
            label="Artículos"
          />
        ),
        size: 110,
        cell: ({ row }) => {
          const itemsCount = (row.original.quote_items ?? []).reduce(
            (sum, item) => sum + (item.quantity ?? 0),
            0
          );
          return (
            <div className="pr-2 text-right font-medium text-sm">
              <span className="font-semibold text-foreground">
                {itemsCount}
              </span>{" "}
              <span className="text-muted-foreground text-xs">
                {itemsCount === 1 ? "unidad" : "unidades"}
              </span>
            </div>
          );
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "total_amount",
        accessorKey: "total_amount",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="ml-auto justify-end"
            column={column}
            label="Total"
          />
        ),
        size: 140,
        cell: ({ row }) => {
          const amount = row.original.total_amount;
          const currency = row.original.currency;
          return (
            <div className="text-right font-semibold text-sm">
              {formatCurrency(amount, currency)}
            </div>
          );
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Estado" />
        ),
        size: 150,
        cell: ({ row }) => {
          const status = row.original.status;
          const statusInfo = statusStyles[status] ?? {
            label: status,
            icon: ClipboardTextIcon,
            className: "bg-muted text-muted-foreground border-transparent",
          };
          const StatusIcon = statusInfo.icon;

          return (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-xs",
                statusInfo.className
              )}
            >
              <StatusIcon className="h-3.5 w-3.5" weight="duotone" />
              {statusInfo.label}
            </div>
          );
        },
        enableColumnFilter: false,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "actions",
        size: 320,
        cell: ({ row }) => {
          const quote = row.original;
          const displayName =
            quote.customers?.fantasy_name ||
            quote.customers?.business_name ||
            "Cliente desconocido";
          return (
            <QuoteActionsCell
              createdAt={quote.created_at}
              customerEmail={quote.customers?.email ?? null}
              customerName={displayName}
              orgSlug={orgSlug}
              quoteId={quote.id}
              status={quote.status}
            />
          );
        },
      },
    ],
    [orgSlug]
  );

  const { table } = useDataTable<QuoteWithCustomer>({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
    },
  });

  const currentTab: TabValue =
    tabs.find((t) => t.value === estado)?.value ?? "ALL";

  const handleTabChange = (value: string) => {
    if (value === "ALL") {
      setEstado(null);
    } else {
      setEstado(value);
    }
    table.setPageIndex(0);
  };

  const isDataEmpty = data.length === 0;
  const hasActiveFilters = search || estado !== "ALL";
  const hasActiveColumnFilters = table.getState().columnFilters.length > 0;

  if (data.length > 0) {
    everHadData.current = true;
  }

  if (
    isDataEmpty &&
    !hasActiveFilters &&
    !hasActiveColumnFilters &&
    !everHadData.current
  ) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardTextIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay presupuestos</EmptyTitle>
            <EmptyDescription>
              Aún no has creado ningún presupuesto en esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <a href={`/org/${orgSlug}/presupuestos/nuevo`}>
                Crear el primero
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        className="w-full"
        onValueChange={handleTabChange}
        value={currentTab}
      >
        <TabsList>
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                <IconComponent
                  className={`mr-1.5 h-4 w-4 ${tab.color}`}
                  weight="duotone"
                />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <DataTable
        onRowClick={(row) => handleRowClick(row.original.id)}
        table={table}
      >
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
                  placeholder="Buscar por cliente..."
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
          <QuotesExportButton orgSlug={orgSlug} table={table} />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
