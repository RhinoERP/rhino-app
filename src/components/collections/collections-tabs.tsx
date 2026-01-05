"use client";

import {
  FactoryIcon,
  HandCoinsIcon,
  PiggyBankIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";
import { CurrentAccounts } from "./current-accounts";
import { PayablesTable } from "./payables-table";
import { ReceivablesTable } from "./receivables-table";

type CollectionsTabsProps = {
  orgSlug: string;
  receivables: ReceivableAccount[];
  payables: PayableAccount[];
};

type TabValue =
  | "receivables"
  | "payables"
  | "current-customers"
  | "current-suppliers";

export function CollectionsTabs({
  orgSlug,
  receivables,
  payables,
}: CollectionsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("vista");

  const currentTab: TabValue = (() => {
    switch (viewParam) {
      case "cxp":
        return "payables";
      case "cc-clientes":
        return "current-customers";
      case "cc-proveedores":
        return "current-suppliers";
      default:
        return "receivables";
    }
  })();

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    let nextVista: string | null = null;
    if (value === "payables") {
      nextVista = "cxp";
    } else if (value === "current-customers") {
      nextVista = "cc-clientes";
    } else if (value === "current-suppliers") {
      nextVista = "cc-proveedores";
    }

    if (nextVista) {
      params.set("vista", nextVista);
    } else {
      params.delete("vista");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs className="w-full" onValueChange={handleTabChange} value={currentTab}>
      <TabsList>
        <TabsTrigger value="receivables">
          <PiggyBankIcon className="mr-2 h-4 w-4" weight="duotone" />
          Por cobrar
        </TabsTrigger>
        <TabsTrigger value="payables">
          <HandCoinsIcon className="mr-2 h-4 w-4" weight="duotone" />
          Por pagar
        </TabsTrigger>
        <TabsTrigger value="current-customers">
          <UsersThreeIcon className="mr-2 h-4 w-4" weight="duotone" />
          CC clientes
        </TabsTrigger>
        <TabsTrigger value="current-suppliers">
          <FactoryIcon className="mr-2 h-4 w-4" weight="duotone" />
          CC proveedores
        </TabsTrigger>
      </TabsList>
      <TabsContent className="mt-2" value="receivables">
        <ReceivablesTable orgSlug={orgSlug} receivables={receivables} />
      </TabsContent>
      <TabsContent className="mt-2" value="payables">
        <PayablesTable orgSlug={orgSlug} payables={payables} />
      </TabsContent>
      <TabsContent className="mt-2" value="current-customers">
        <CurrentAccounts orgSlug={orgSlug} receivables={receivables} />
      </TabsContent>
      <TabsContent className="mt-2" value="current-suppliers">
        <CurrentAccounts orgSlug={orgSlug} payables={payables} />
      </TabsContent>
    </Tabs>
  );
}
