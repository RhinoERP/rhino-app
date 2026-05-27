"use client";

import { Banknote, Receipt } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  PosCashControlTerminal,
  PosSessionSummary,
} from "@/modules/pos/types";
import type { DirectSale } from "@/modules/sales/types";
import { CashControlSessionsTab } from "./cash-control-sessions-tab";
import { DirectSalesTable } from "./direct-sales-table";

type DirectSalesTabsProps = {
  orgSlug: string;
  sales: DirectSale[];
  totalCount: number;
  perPage: number;
  sessions: PosSessionSummary[];
  terminals: PosCashControlTerminal[];
};

export function DirectSalesTabs({
  orgSlug,
  sales,
  totalCount,
  perPage,
  sessions,
  terminals,
}: DirectSalesTabsProps) {
  const [activeTab, setActiveTab] = useState<"sales" | "cash-control">("sales");

  return (
    <Tabs
      className="w-full"
      onValueChange={(value) => setActiveTab(value as "sales" | "cash-control")}
      value={activeTab}
    >
      <TabsList>
        <TabsTrigger value="sales">
          <Receipt className="h-4 w-4" />
          Ventas directas
        </TabsTrigger>
        <TabsTrigger value="cash-control">
          <Banknote className="h-4 w-4" />
          Sesiones de caja
        </TabsTrigger>
      </TabsList>

      <TabsContent className="mt-2" value="sales">
        <DirectSalesTable
          orgSlug={orgSlug}
          perPage={perPage}
          sales={sales}
          totalCount={totalCount}
        />
      </TabsContent>

      <TabsContent className="mt-2" value="cash-control">
        <CashControlSessionsTab
          orgSlug={orgSlug}
          sessions={sessions}
          terminals={terminals}
        />
      </TabsContent>
    </Tabs>
  );
}
