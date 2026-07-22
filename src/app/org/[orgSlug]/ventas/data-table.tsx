"use client";

import {
  CalendarBlankIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  ClipboardTextIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  TruckIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { BulkActionBar } from "@/components/sales/bulk-actions/bulk-action-bar";
import { createSalesColumns } from "@/components/sales/columns/sale-columns-all";
import { SalesExportButton } from "@/components/sales/sales-export-button";
import { SalesMobileList } from "@/components/sales/sales-mobile-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataTable } from "@/hooks/use-data-table";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

const MAX_SELECTION = 20;

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: ReactNode; color: string }
> = {
  ALL: {
    label: "Todas",
    icon: <ShoppingBagIcon className="h-4 w-4" weight="duotone" />,
    color: "text-slate-500",
  },
  DRAFT: {
    label: "Preventas",
    icon: <ClipboardTextIcon className="h-4 w-4" weight="duotone" />,
    color: "text-amber-500",
  },
  CONFIRMED: {
    label: "Confirmadas",
    icon: <CheckCircleIcon className="h-4 w-4" weight="duotone" />,
    color: "text-blue-500",
  },
  DISPATCH: {
    label: "Despachadas",
    icon: <TruckIcon className="h-4 w-4" weight="duotone" />,
    color: "text-orange-500",
  },
  DELIVERED: {
    label: "Entregadas",
    icon: <CheckCircleIcon className="h-4 w-4" weight="duotone" />,
    color: "text-green-500",
  },
  CANCELLED: {
    label: "Canceladas",
    icon: <XCircleIcon className="h-4 w-4" weight="duotone" />,
    color: "text-red-500",
  },
};

const DATE_CONFIG: Record<string, string> = {
  ALL_DATES: "Todas las fechas",
  hoy: "Hoy",
  ayer: "Ayer",
  "7dias": "Últimos 7 días",
  mes: "Este mes",
};

type SalesDataTableProps = {
  orgSlug: string;
  initialData: SalesOrderWithCustomer[];
  pageCount: number;
  customers?: {
    id: string;
    business_name?: string | null;
    fantasy_name?: string | null;
  }[];
};

function MobileSalesFilters({
  currentTab,
  currentDateFilter,
  activeFiltersCount,
  filtersOpen,
  onTabChange,
  onDateFilterChange,
  onClearFilters,
  onOpenChange,
}: {
  currentTab: string;
  currentDateFilter: string;
  activeFiltersCount: number;
  filtersOpen: boolean;
  onTabChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={filtersOpen}>
      <SheetTrigger asChild>
        <Button className="w-full" variant="outline">
          {STATUS_CONFIG[currentTab]?.icon}
          <span className="ml-2 min-w-0 flex-1 truncate text-left">
            {STATUS_CONFIG[currentTab]?.label}
            {currentDateFilter !== "ALL_DATES" &&
              ` · ${DATE_CONFIG[currentDateFilter]}`}
          </span>
          {activeFiltersCount > 0 && (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="h-[80vh] overflow-y-auto" side="bottom">
        <SheetHeader>
          <SheetTitle>Filtros de ventas</SheetTitle>
          <SheetDescription>
            Filtra las ventas por estado y fecha.
          </SheetDescription>
        </SheetHeader>
        {activeFiltersCount > 0 && (
          <div className="px-4">
            <Button
              className="w-full"
              onClick={onClearFilters}
              variant="outline"
            >
              Limpiar filtros
            </Button>
          </div>
        )}
        <div className="space-y-3 px-4">
          <div className="font-medium text-muted-foreground text-xs uppercase">
            Estado
          </div>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <Button
              className={`w-full justify-start ${currentTab === status ? "bg-primary/10" : ""}`}
              key={status}
              onClick={() => {
                onTabChange(status);
                onOpenChange(false);
              }}
              variant={currentTab === status ? "secondary" : "ghost"}
            >
              <span className={config.color}>{config.icon}</span>
              <span className="ml-2">{config.label}</span>
            </Button>
          ))}
        </div>
        <div className="space-y-3 px-4 pb-4">
          <div className="font-medium text-muted-foreground text-xs uppercase">
            Fecha
          </div>
          {Object.entries(DATE_CONFIG).map(([filter, label]) => (
            <Button
              className={`w-full justify-start ${currentDateFilter === filter ? "bg-primary/10" : ""}`}
              key={filter}
              onClick={() => {
                onDateFilterChange(filter);
                onOpenChange(false);
              }}
              variant={currentDateFilter === filter ? "secondary" : "ghost"}
            >
              <CalendarBlankIcon
                className="h-4 w-4 text-slate-500"
                weight="duotone"
              />
              <span className="ml-2">{label}</span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type CustomerSelectorProps = {
  customers: {
    id: string;
    fantasy_name?: string | null;
    business_name?: string | null;
  }[];
  cliente: string | null;
  setCliente: (v: string | null) => Promise<URLSearchParams>;
  resetPage: () => void;
};

function CustomerSelector({
  customers,
  cliente,
  setCliente,
  resetPage,
}: CustomerSelectorProps) {
  return (
    <Select
      onValueChange={(value) => {
        setCliente(value === "all" ? null : value);
        resetPage();
      }}
      value={cliente ?? "all"}
    >
      <SelectTrigger className="h-8 w-48">
        <SelectValue placeholder="Todos los clientes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los clientes</SelectItem>
        {customers.map((c) => {
          const name = c.fantasy_name || c.business_name || c.id.slice(0, 8);
          return (
            <SelectItem key={c.id} value={c.id}>
              {name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function EmptyState({ currentTab }: { currentTab: string }) {
  return (
    <div className="rounded-md border">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShoppingBagIcon className="size-6" weight="duotone" />
          </EmptyMedia>
          <EmptyTitle>No hay ventas</EmptyTitle>
          <EmptyDescription>
            {currentTab === "ALL"
              ? "Aún no has registrado ventas en esta organización."
              : `No hay ventas en estado "${STATUS_CONFIG[currentTab]?.label || currentTab}" en este momento.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function SalesDataTable({
  orgSlug,
  initialData,
  pageCount,
  customers = [],
}: SalesDataTableProps) {
  const isMobile = useIsMobile();
  const [_rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [estado, setEstado] = useQueryState(
    "estado",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [fecha, setFecha] = useQueryState(
    "fecha",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [cliente, setCliente] = useQueryState(
    "cliente",
    parseAsString.withOptions({ shallow: false })
  );
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const columns = useMemo(() => {
    const base = createSalesColumns({
      orgSlug,
      includeStatusFilter: false,
    });
    if (!selectionMode) {
      return base;
    }
    const selectColumn: ColumnDef<SalesOrderWithCustomer> = {
      id: "select",
      header: ({ table: t }) => (
        <Checkbox
          aria-label="Seleccionar todo"
          checked={t.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => t.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row: r, table: t }) => {
        const selectedCount = Object.keys(t.getState().rowSelection).length;
        const disabled = !r.getIsSelected() && selectedCount >= MAX_SELECTION;
        return (
          <Checkbox
            aria-label="Seleccionar fila"
            checked={r.getIsSelected()}
            disabled={disabled}
            onCheckedChange={(value) => r.toggleSelected(!!value)}
            onClick={(event) => event.stopPropagation()}
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    };
    return [selectColumn, ...base];
  }, [orgSlug, selectionMode]);

  const { table } = useDataTable<SalesOrderWithCustomer>({
    data: initialData,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      columnVisibility: {
        locality: false,
        remittance_number: false,
        carrier: false,
        confirmed_at: false,
        dispatched_at: false,
        delivered_at: false,
        cancelled_at: false,
      },
    },
  });

  const selectedSales = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  const handleTabChange = (value: string) => {
    setEstado(value === "ALL" ? null : value);
    table.setPageIndex(0);
  };

  const handleDateFilterChange = (value: string) => {
    setFecha(value === "ALL_DATES" ? null : value);
    table.setPageIndex(0);
  };

  const handleClearFilters = () => {
    setFecha(null);
    setEstado(null);
    setCliente(null);
    table.setPageIndex(0);
  };

  const currentTab = estado || "ALL";
  const currentDateFilter = fecha || "ALL_DATES";
  const activeFiltersCount =
    (currentTab === "ALL" ? 0 : 1) +
    (currentDateFilter === "ALL_DATES" ? 0 : 1) +
    Number(!!cliente);

  const rows = table.getRowModel().rows;
  const hasData = rows.length > 0;

  const everHadData = useRef(false);
  if (hasData) {
    everHadData.current = true;
  }

  return (
    <div className="space-y-4">
      {isMobile ? (
        <MobileSalesFilters
          activeFiltersCount={activeFiltersCount}
          currentDateFilter={currentDateFilter}
          currentTab={currentTab}
          filtersOpen={filtersOpen}
          onClearFilters={handleClearFilters}
          onDateFilterChange={handleDateFilterChange}
          onOpenChange={setFiltersOpen}
          onTabChange={handleTabChange}
        />
      ) : (
        <Tabs
          className="w-full"
          onValueChange={handleTabChange}
          value={currentTab}
        >
          <TabsList>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <TabsTrigger key={status} value={status}>
                <span className={config.color}>{config.icon}</span>
                <span className="ml-1.5">{config.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {hasData && isMobile && (
        <SalesMobileList
          orgSlug={orgSlug}
          sales={rows.map((r) => r.original)}
        />
      )}

      {!isMobile && (
        <div className="space-y-4">
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
                      placeholder="Buscar por N° de venta, cliente..."
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
                <CustomerSelector
                  cliente={cliente}
                  customers={customers}
                  resetPage={() => table.setPageIndex(0)}
                  setCliente={setCliente}
                />
              )}
              <SalesExportButton orgSlug={orgSlug} table={table} />
              <Button
                onClick={() => {
                  if (selectionMode) {
                    setRowSelection({});
                  }
                  setSelectionMode((v) => !v);
                }}
                size="sm"
                variant={selectionMode ? "secondary" : "outline"}
              >
                <CheckSquareIcon
                  className="mr-1.5 size-4"
                  weight={selectionMode ? "fill" : "regular"}
                />
                Acciones masivas
              </Button>
            </DataTableToolbar>
          </DataTable>
          <BulkActionBar
            availableActions={["invoice"]}
            onClearSelection={() => setRowSelection({})}
            orgSlug={orgSlug}
            selectedSales={selectedSales}
          />
        </div>
      )}

      {!(hasData || everHadData.current) && (
        <EmptyState currentTab={currentTab} />
      )}
    </div>
  );
}
