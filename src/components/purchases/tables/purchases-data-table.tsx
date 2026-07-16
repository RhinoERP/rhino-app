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
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataTable } from "@/hooks/use-data-table";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
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
}[] = [
  { value: "ALL", label: "Todas", icon: ShoppingCartIcon },
  { value: "DRAFT", label: "Pre-compras", icon: FileTextIcon },
  { value: "ORDERED", label: "Ordenadas", icon: ClipboardTextIcon },
  { value: "IN_TRANSIT", label: "En tránsito", icon: TruckIcon },
  { value: "RECEIVED", label: "Recibidas", icon: CheckCircleIcon },
  { value: "CANCELLED", label: "Canceladas", icon: XCircleIcon },
];

type PurchasesDataTableProps = {
  orgSlug: string;
  data: PurchaseOrderWithSupplier[];
  pageCount: number;
  showPrePurchasesTab?: boolean;
};

export function PurchasesDataTable({
  orgSlug,
  data,
  pageCount,
  showPrePurchasesTab = false,
}: PurchasesDataTableProps) {
  const columns = useMemo(() => createAllPurchasesColumns(orgSlug), [orgSlug]);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withOptions({ shallow: false }).withDefault(1)
  );
  const [estado, setEstado] = useQueryState(
    "estado",
    parseAsString.withOptions({ shallow: false }).withDefault("ALL")
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
    setPage(1);
  };

  const isDataEmpty = data.length === 0;

  if (isDataEmpty && !search && currentTab === "ALL") {
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
                <Icon className="mr-1.5 h-4 w-4" weight="duotone" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <div className="relative">
            <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-48 pl-8 lg:w-72"
              onChange={(event) => {
                setSearch(event.target.value || null);
                setPage(1);
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
                setPage(1);
              }}
              size="sm"
              variant="outline"
            >
              <XIcon />
              Limpiar
            </Button>
          )}
          <PurchasesExportButton
            filename="compras"
            sheetName="Compras"
            table={table}
          />
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}
