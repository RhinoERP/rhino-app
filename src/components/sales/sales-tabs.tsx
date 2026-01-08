"use client";

import {
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
import { AllSalesTable } from "./all-sales-table";
import { CancelledSalesTable } from "./cancelled-sales-table";
import { ConfirmedSalesTable } from "./confirmed-sales-table";
import { DeliveredSalesTable } from "./delivered-sales-table";
import { DispatchedSalesTable } from "./dispatched-sales-table";
import { DraftSalesTable } from "./draft-sales-table";

type SalesStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "DISPATCH"
  | "DELIVERED"
  | "CANCELLED"
  | "ALL";

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

export function SalesTabs({ orgSlug, sales }: SalesTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const estadoParam = searchParams.get("estado");
  const currentTab: SalesStatus =
    estadoParam && VALID_STATUSES.includes(estadoParam as SalesStatus)
      ? (estadoParam as SalesStatus)
      : "ALL";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("estado");
    } else {
      params.set("estado", value);
    }
    router.push(`?${params.toString()}`, { scroll: false });
    if (isMobile === true) {
      setFiltersOpen(false);
    }
  };

  const preSales = sales.filter((sale) => sale.status === "DRAFT");
  const confirmedSales = sales.filter((sale) => sale.status === "CONFIRMED");
  const dispatchedSales = sales.filter((sale) => sale.status === "DISPATCH");
  const deliveredSales = sales.filter((sale) => sale.status === "DELIVERED");
  const cancelledSales = sales.filter((sale) => sale.status === "CANCELLED");

  const currentStatusConfig = STATUS_CONFIG[currentTab];

  return (
    <div className="space-y-4">
      {/* Mobile: Filter Button */}
      {isMobile && (
        <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
          <SheetTrigger asChild>
            <Button className="w-full" variant="outline">
              <span className={currentStatusConfig.color}>
                {currentStatusConfig.icon}
              </span>
              <span className="ml-2">{currentStatusConfig.label}</span>
              {currentTab !== "ALL" && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
                  1
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="h-[80vh]" side="bottom">
            <SheetHeader>
              <SheetTitle>Estado de venta</SheetTitle>
              <SheetDescription>
                Filtra las ventas por su estado
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              {(Object.keys(STATUS_CONFIG) as SalesStatus[]).map((status) => {
                const config = STATUS_CONFIG[status];
                const isActive = currentTab === status;
                return (
                  <Button
                    className={`w-full justify-start ${isActive ? "bg-primary/10" : ""}`}
                    key={status}
                    onClick={() => handleTabChange(status)}
                    variant={isActive ? "secondary" : "ghost"}
                  >
                    <span className={config.color}>{config.icon}</span>
                    <span className="ml-2">{config.label}</span>
                  </Button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
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
          <AllSalesTable orgSlug={orgSlug} sales={sales} />
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
            <AllSalesTable orgSlug={orgSlug} sales={sales} />
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
