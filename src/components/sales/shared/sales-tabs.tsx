"use client";

import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ShoppingBagIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { AllSalesTable } from "../tables/all-sales-table";
import { CancelledSalesTable } from "../tables/cancelled-sales-table";
import { ConfirmedSalesTable } from "../tables/confirmed-sales-table";
import { DeliveredSalesTable } from "../tables/delivered-sales-table";
import { DispatchedSalesTable } from "../tables/dispatched-sales-table";
import { DraftSalesTable } from "../tables/draft-sales-table";

type SalesStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "DISPATCH"
  | "DELIVERED"
  | "CANCELLED"
  | "ALL";

type SalesDateFilter =
  | "ALL_DATES"
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "THIS_MONTH";

type SalesTabsProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

const VALID_STATUSES: SalesStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "DISPATCH",
  "DELIVERED",
  "CANCELLED",
  "ALL",
];

const DATE_PARAM_BY_FILTER: Record<SalesDateFilter, string | null> = {
  ALL_DATES: null,
  TODAY: "hoy",
  YESTERDAY: "ayer",
  LAST_7_DAYS: "7dias",
  THIS_MONTH: "mes",
};

const DATE_FILTER_BY_PARAM: Record<string, SalesDateFilter> = {
  "7dias": "LAST_7_DAYS",
  ayer: "YESTERDAY",
  hoy: "TODAY",
  mes: "THIS_MONTH",
};

const DATE_CONFIG: Record<SalesDateFilter, { label: string }> = {
  ALL_DATES: { label: "Todas las fechas" },
  TODAY: { label: "Hoy" },
  YESTERDAY: { label: "Ayer" },
  LAST_7_DAYS: { label: "Últimos 7 días" },
  THIS_MONTH: { label: "Este mes" },
};

const STATUS_CONFIG: Record<
  SalesStatus,
  { label: string; icon: React.ReactNode; color: string }
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

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseSaleDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);

  if (!(year && month && day)) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const isSaleInDateFilter = (
  sale: SalesOrderWithCustomer,
  filter: SalesDateFilter
) => {
  if (filter === "ALL_DATES") {
    return true;
  }

  const saleDate = parseSaleDate(sale.sale_date);
  if (!saleDate) {
    return false;
  }

  const today = startOfLocalDay(new Date());
  const normalizedSaleDate = startOfLocalDay(saleDate);

  if (filter === "TODAY") {
    return normalizedSaleDate.getTime() === today.getTime();
  }

  if (filter === "YESTERDAY") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return normalizedSaleDate.getTime() === yesterday.getTime();
  }

  if (filter === "LAST_7_DAYS") {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    return normalizedSaleDate >= sevenDaysAgo && normalizedSaleDate <= today;
  }

  return (
    normalizedSaleDate.getFullYear() === today.getFullYear() &&
    normalizedSaleDate.getMonth() === today.getMonth()
  );
};

type MobileSalesFiltersProps = {
  activeFiltersCount: number;
  currentDateFilter: SalesDateFilter;
  currentTab: SalesStatus;
  filtersOpen: boolean;
  onClearFilters: () => void;
  onDateFilterChange: (value: SalesDateFilter) => void;
  onOpenChange: (open: boolean) => void;
  onTabChange: (value: string) => void;
};

function MobileSalesFilters({
  activeFiltersCount,
  currentDateFilter,
  currentTab,
  filtersOpen,
  onClearFilters,
  onDateFilterChange,
  onOpenChange,
  onTabChange,
}: MobileSalesFiltersProps) {
  const currentStatusConfig = STATUS_CONFIG[currentTab];
  const currentDateConfig = DATE_CONFIG[currentDateFilter];

  return (
    <Sheet onOpenChange={onOpenChange} open={filtersOpen}>
      <SheetTrigger asChild>
        <Button className="w-full" variant="outline">
          <span className={currentStatusConfig.color}>
            {currentStatusConfig.icon}
          </span>
          <span className="ml-2 min-w-0 flex-1 truncate text-left">
            {currentStatusConfig.label}
            {currentDateFilter !== "ALL_DATES" &&
              ` · ${currentDateConfig.label}`}
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
          {(Object.keys(STATUS_CONFIG) as SalesStatus[]).map((status) => {
            const config = STATUS_CONFIG[status];
            const isActive = currentTab === status;
            return (
              <Button
                className={`w-full justify-start ${isActive ? "bg-primary/10" : ""}`}
                key={status}
                onClick={() => onTabChange(status)}
                variant={isActive ? "secondary" : "ghost"}
              >
                <span className={config.color}>{config.icon}</span>
                <span className="ml-2">{config.label}</span>
              </Button>
            );
          })}
        </div>
        <div className="space-y-3 px-4 pb-4">
          <div className="font-medium text-muted-foreground text-xs uppercase">
            Fecha
          </div>
          {(Object.keys(DATE_CONFIG) as SalesDateFilter[]).map((filter) => {
            const config = DATE_CONFIG[filter];
            const isActive = currentDateFilter === filter;
            return (
              <Button
                className={`w-full justify-start ${isActive ? "bg-primary/10" : ""}`}
                key={filter}
                onClick={() => onDateFilterChange(filter)}
                variant={isActive ? "secondary" : "ghost"}
              >
                <CalendarBlankIcon
                  className="h-4 w-4 text-slate-500"
                  weight="duotone"
                />
                <span className="ml-2">{config.label}</span>
              </Button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SalesTabs({ orgSlug, sales }: SalesTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const estadoParam = searchParams.get("estado");
  const fechaParam = searchParams.get("fecha");
  const currentTab: SalesStatus =
    estadoParam && VALID_STATUSES.includes(estadoParam as SalesStatus)
      ? (estadoParam as SalesStatus)
      : "ALL";
  const currentDateFilter: SalesDateFilter =
    fechaParam && DATE_FILTER_BY_PARAM[fechaParam]
      ? DATE_FILTER_BY_PARAM[fechaParam]
      : "ALL_DATES";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("estado");
    } else {
      params.set("estado", value);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleDateFilterChange = (value: SalesDateFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    const paramValue = DATE_PARAM_BY_FILTER[value];

    if (paramValue) {
      params.set("fecha", paramValue);
    } else {
      params.delete("fecha");
    }

    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleClearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("estado");
    params.delete("fecha");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const filteredSales = sales.filter((sale) =>
    isSaleInDateFilter(sale, currentDateFilter)
  );
  const preSales = filteredSales.filter((sale) => sale.status === "DRAFT");
  const confirmedSales = filteredSales.filter(
    (sale) => sale.status === "CONFIRMED"
  );
  const dispatchedSales = filteredSales.filter(
    (sale) => sale.status === "DISPATCH"
  );
  const deliveredSales = filteredSales.filter(
    (sale) => sale.status === "DELIVERED"
  );
  const cancelledSales = filteredSales.filter(
    (sale) => sale.status === "CANCELLED"
  );

  const activeFiltersCount =
    (currentTab === "ALL" ? 0 : 1) +
    (currentDateFilter === "ALL_DATES" ? 0 : 1);

  return (
    <div className="space-y-4">
      {/* Mobile: Filter Button */}
      {isMobile && (
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
      )}

      {/* Desktop: Tabs */}
      <Tabs
        className="hidden w-full md:block"
        onValueChange={handleTabChange}
        value={currentTab}
      >
        <TabsList>
          <TabsTrigger value="ALL">
            <ShoppingBagIcon
              className="h-4 w-4 text-slate-500"
              weight="duotone"
            />
            Todas
          </TabsTrigger>
          <TabsTrigger value="DRAFT">
            <ClipboardTextIcon
              className="h-4 w-4 text-amber-500"
              weight="duotone"
            />
            Preventas
          </TabsTrigger>
          <TabsTrigger value="CONFIRMED">
            <CheckCircleIcon
              className="h-4 w-4 text-blue-500"
              weight="duotone"
            />
            Confirmadas
          </TabsTrigger>
          <TabsTrigger value="DISPATCH">
            <TruckIcon className="h-4 w-4 text-orange-500" weight="duotone" />
            Despachadas
          </TabsTrigger>
          <TabsTrigger value="DELIVERED">
            <CheckCircleIcon
              className="h-4 w-4 text-green-500"
              weight="duotone"
            />
            Entregadas
          </TabsTrigger>
          <TabsTrigger value="CANCELLED">
            <XCircleIcon className="h-4 w-4 text-red-500" weight="duotone" />
            Canceladas
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-2" value="ALL">
          <AllSalesTable orgSlug={orgSlug} sales={filteredSales} />
        </TabsContent>
        <TabsContent className="mt-2" value="DRAFT">
          <DraftSalesTable orgSlug={orgSlug} sales={preSales} />
        </TabsContent>
        <TabsContent className="mt-2" value="CONFIRMED">
          <ConfirmedSalesTable orgSlug={orgSlug} sales={confirmedSales} />
        </TabsContent>
        <TabsContent className="mt-2" value="DISPATCH">
          <DispatchedSalesTable orgSlug={orgSlug} sales={dispatchedSales} />
        </TabsContent>
        <TabsContent className="mt-2" value="DELIVERED">
          <DeliveredSalesTable orgSlug={orgSlug} sales={deliveredSales} />
        </TabsContent>
        <TabsContent className="mt-2" value="CANCELLED">
          <CancelledSalesTable orgSlug={orgSlug} sales={cancelledSales} />
        </TabsContent>
      </Tabs>

      {/* Mobile: Content (always visible, no tabs wrapper needed) */}
      {isMobile && (
        <>
          {currentTab === "ALL" && (
            <AllSalesTable orgSlug={orgSlug} sales={filteredSales} />
          )}
          {currentTab === "DRAFT" && (
            <DraftSalesTable orgSlug={orgSlug} sales={preSales} />
          )}
          {currentTab === "CONFIRMED" && (
            <ConfirmedSalesTable orgSlug={orgSlug} sales={confirmedSales} />
          )}
          {currentTab === "DISPATCH" && (
            <DispatchedSalesTable orgSlug={orgSlug} sales={dispatchedSales} />
          )}
          {currentTab === "DELIVERED" && (
            <DeliveredSalesTable orgSlug={orgSlug} sales={deliveredSales} />
          )}
          {currentTab === "CANCELLED" && (
            <CancelledSalesTable orgSlug={orgSlug} sales={cancelledSales} />
          )}
        </>
      )}
    </div>
  );
}
