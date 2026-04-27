"use client";

import {
  FactoryIcon,
  HandCoinsIcon,
  PiggyBankIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CollectionTabValue,
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
  wholesaleEnabled: boolean;
};

type CollectionTabQueryValue = "cxp" | "cc-clientes" | "cc-proveedores" | null;

const tabQueryValues: Record<CollectionTabValue, CollectionTabQueryValue> = {
  receivables: null,
  payables: "cxp",
  "current-customers": "cc-clientes",
  "current-suppliers": "cc-proveedores",
};

function getTabFromQueryValue(value: string | null): CollectionTabValue | null {
  switch (value) {
    case null:
      return "receivables";
    case "cxp":
      return "payables";
    case "cc-clientes":
      return "current-customers";
    case "cc-proveedores":
      return "current-suppliers";
    default:
      return null;
  }
}

export function CollectionsTabs({
  orgSlug,
  receivables,
  payables,
  wholesaleEnabled,
}: CollectionsTabsProps) {
  const [vista, setVista] = useQueryState(
    "vista",
    parseAsString.withOptions({
      clearOnDefault: false,
      history: "replace",
      shallow: true,
      scroll: false,
    })
  );

  const availableTabs: CollectionTabValue[] = wholesaleEnabled
    ? ["receivables", "payables", "current-customers", "current-suppliers"]
    : ["payables", "current-suppliers"];

  const requestedTab = getTabFromQueryValue(vista);
  const defaultTab = availableTabs[0];
  const currentTab =
    requestedTab && availableTabs.includes(requestedTab)
      ? requestedTab
      : defaultTab;

  const handleTabChange = (value: string) => {
    const nextTab = value as CollectionTabValue;
    setVista(tabQueryValues[nextTab]);
  };

  useEffect(() => {
    if (requestedTab === currentTab) {
      return;
    }

    setVista(tabQueryValues[currentTab]);
  }, [currentTab, requestedTab, setVista]);

  return (
    <Tabs className="w-full" onValueChange={handleTabChange} value={currentTab}>
      <TabsList>
        {wholesaleEnabled ? (
          <TabsTrigger value="receivables">
            <PiggyBankIcon className="mr-2 h-4 w-4" weight="duotone" />
            Por cobrar
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="payables">
          <HandCoinsIcon className="mr-2 h-4 w-4" weight="duotone" />
          Por pagar
        </TabsTrigger>
        {wholesaleEnabled ? (
          <TabsTrigger value="current-customers">
            <UsersThreeIcon className="mr-2 h-4 w-4" weight="duotone" />
            CC clientes
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="current-suppliers">
          <FactoryIcon className="mr-2 h-4 w-4" weight="duotone" />
          CC proveedores
        </TabsTrigger>
      </TabsList>
      {wholesaleEnabled ? (
        <TabsContent className="mt-2" value="receivables">
          <ReceivablesTable orgSlug={orgSlug} receivables={receivables} />
        </TabsContent>
      ) : null}
      <TabsContent className="mt-2" value="payables">
        <PayablesTable orgSlug={orgSlug} payables={payables} />
      </TabsContent>
      {wholesaleEnabled ? (
        <TabsContent className="mt-2" value="current-customers">
          <CurrentAccounts orgSlug={orgSlug} receivables={receivables} />
        </TabsContent>
      ) : null}
      <TabsContent className="mt-2" value="current-suppliers">
        <CurrentAccounts orgSlug={orgSlug} payables={payables} />
      </TabsContent>
    </Tabs>
  );
}
