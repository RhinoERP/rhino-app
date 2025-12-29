"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  ShoppingBagIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function SalesTabs({ orgSlug, sales }: SalesTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  };

  const preSales = sales.filter((sale) => sale.status === "DRAFT");
  const confirmedSales = sales.filter((sale) => sale.status === "CONFIRMED");
  const dispatchedSales = sales.filter((sale) => sale.status === "DISPATCH");
  const deliveredSales = sales.filter((sale) => sale.status === "DELIVERED");
  const cancelledSales = sales.filter((sale) => sale.status === "CANCELLED");

  return (
    <Tabs className="w-full" onValueChange={handleTabChange} value={currentTab}>
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
          <CheckCircleIcon className="h-4 w-4 text-blue-500" weight="duotone" />
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
  );
}
