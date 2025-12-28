"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  ShoppingCartIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import { AllPurchasesTable } from "../tables/all-purchases-table";
import { CancelledPurchasesTable } from "../tables/cancelled-purchases-table";
import { InTransitPurchasesTable } from "../tables/in-transit-purchases-table";
import { OrderedPurchasesTable } from "../tables/ordered-purchases-table";
import { ReceivedPurchasesTable } from "../tables/received-purchases-table";

type PurchaseStatus =
  | "ORDERED"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "CANCELLED"
  | "ALL";

type PurchasesTabsProps = {
  orgSlug: string;
  purchases: PurchaseOrderWithSupplier[];
};

const VALID_STATUSES: PurchaseStatus[] = [
  "ORDERED",
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
  "ALL",
];

export function PurchasesTabs({ orgSlug, purchases }: PurchasesTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const estadoParam = searchParams.get("estado");
  const currentTab: PurchaseStatus =
    estadoParam && VALID_STATUSES.includes(estadoParam as PurchaseStatus)
      ? (estadoParam as PurchaseStatus)
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

  const orderedPurchases = purchases.filter((p) => p.status === "ORDERED");
  const inTransitPurchases = purchases.filter((p) => p.status === "IN_TRANSIT");
  const receivedPurchases = purchases.filter((p) => p.status === "RECEIVED");
  const cancelledPurchases = purchases.filter((p) => p.status === "CANCELLED");

  return (
    <Tabs className="w-full" onValueChange={handleTabChange} value={currentTab}>
      <TabsList>
        <TabsTrigger value="ALL">
          <ShoppingCartIcon
            className="h-4 w-4 text-slate-500"
            weight="duotone"
          />
          Todas
        </TabsTrigger>
        <TabsTrigger value="ORDERED">
          <ClipboardTextIcon
            className="h-4 w-4 text-blue-500"
            weight="duotone"
          />
          Ordenadas
        </TabsTrigger>
        <TabsTrigger value="IN_TRANSIT">
          <TruckIcon className="h-4 w-4 text-orange-500" weight="duotone" />
          En tránsito
        </TabsTrigger>
        <TabsTrigger value="RECEIVED">
          <CheckCircleIcon
            className="h-4 w-4 text-green-500"
            weight="duotone"
          />
          Recibidas
        </TabsTrigger>
        <TabsTrigger value="CANCELLED">
          <XCircleIcon className="h-4 w-4 text-red-500" weight="duotone" />
          Canceladas
        </TabsTrigger>
      </TabsList>
      <TabsContent className="mt-2" value="ALL">
        <AllPurchasesTable orgSlug={orgSlug} purchases={purchases} />
      </TabsContent>
      <TabsContent className="mt-2" value="ORDERED">
        <OrderedPurchasesTable orgSlug={orgSlug} purchases={orderedPurchases} />
      </TabsContent>
      <TabsContent className="mt-2" value="IN_TRANSIT">
        <InTransitPurchasesTable
          orgSlug={orgSlug}
          purchases={inTransitPurchases}
        />
      </TabsContent>
      <TabsContent className="mt-2" value="RECEIVED">
        <ReceivedPurchasesTable
          orgSlug={orgSlug}
          purchases={receivedPurchases}
        />
      </TabsContent>
      <TabsContent className="mt-2" value="CANCELLED">
        <CancelledPurchasesTable
          orgSlug={orgSlug}
          purchases={cancelledPurchases}
        />
      </TabsContent>
    </Tabs>
  );
}
