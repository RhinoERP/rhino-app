"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  FileTextIcon,
  HandshakeIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  TruckIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataTable } from "@/hooks/use-data-table";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import type { Supplier } from "@/modules/suppliers/types";
import { createAllPurchasesColumns } from "../columns/purchase-columns-all";
import { PurchasesExportButton } from "../purchases-export-button";

type TabValue =
  | "ALL"
  | "DRAFT"
  | "ORDERED"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "CANCELLED";

const tabs: {
  value: TabValue;
  label: string;
  icon: typeof ShoppingCartIcon;
  color: string;
}[] = [
  {
    color: "text-slate-500",
    label: "Todas",
    icon: ShoppingCartIcon,
    value: "ALL",
  },
  {
    color: "text-amber-500",
    label: "Pre-compras",
    icon: FileTextIcon,
    value: "DRAFT",
  },
  {
    color: "text-blue-500",
    label: "Ordenadas",
    icon: ClipboardTextIcon,
    value: "ORDERED",
  },
  {
    color: "text-orange-500",
    label: "En tránsito",
    icon: TruckIcon,
    value: "IN_TRANSIT",
  },
  {
    color: "text-green-500",
    label: "Recibidas",
    icon: CheckCircleIcon,
    value: "RECEIVED",
  },
  {
    color: "text-red-500",
    label: "Canceladas",
    icon: XCircleIcon,
    value: "CANCELLED",
  },
];

type PurchasesDataTableProps = {
  orgSlug: string;
  data: PurchaseOrderWithSupplier[];
  pageCount: number;
  showPrePurchasesTab?: boolean;
  suppliers?: Supplier[];
};

export function PurchasesDataTable({
  orgSlug,
  data,
  pageCount,
  showPrePurchasesTab = false,
  suppliers = [],
}: PurchasesDataTableProps) {
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const purchase of data) {
      if (
        purchase.supplier?.id &&
        purchase.supplier?.name &&
        !map.has(purchase.supplier.id)
      ) {
        map.set(purchase.supplier.id, purchase.supplier.name);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [data]);

  const columns = useMemo(
    () => createAllPurchasesColumns(orgSlug, supplierOptions),
    [orgSlug, supplierOptions]
  );
  const everHadData = useRef(false);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [estado, setEstado] = useQueryState(
    "estado",
    parseAsString.withOptions({ shallow: false }).withDefault("ALL")
  );
  const [proveedor, setProveedor] = useQueryState(
    "proveedor",
    parseAsString.withOptions({ shallow: false })
  );

  const { table } = useDataTable<PurchaseOrderWithSupplier>({
    data,
    columns,
    pageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
      columnVisibility: {
        in_transit_at: false,
        received_at: false,
        cancelled_at: false,
      },
    },
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
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
  const hasActiveFilters = search || estado !== "ALL" || proveedor;
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
              <HandshakeIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay compras</EmptyTitle>
            <EmptyDescription>
              Aún no has registrado ninguna compra en esta organización.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={`/org/${orgSlug}/compras/nueva`}>Nueva compra</Link>
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
            if (tab.value === "DRAFT" && !showPrePurchasesTab) {
              return null;
            }
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                <Icon
                  className={`mr-1.5 h-4 w-4 ${tab.color}`}
                  weight="duotone"
                />
                {tab.label}
              </TabsTrigger>
            );
          })}
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
                  placeholder="Buscar por N° de compra..."
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
          {suppliers.length > 0 && (
            <Select
              onValueChange={(value) => {
                setProveedor(value === "all" ? null : value);
                table.setPageIndex(0);
              }}
              value={proveedor ?? "all"}
            >
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder="Todos los proveedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <PurchasesExportButton
            filename="compras"
            orgSlug={orgSlug}
            sheetName="Compras"
            table={table}
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
