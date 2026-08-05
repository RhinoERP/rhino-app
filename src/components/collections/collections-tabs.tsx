"use client";

import {
  FactoryIcon,
  HandCoinsIcon,
  PiggyBankIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomerCreditEntry } from "@/modules/collections/service/collections.service";
import type {
  CollectionTabValue,
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";
import { CurrentAccounts } from "./current-accounts";
import { PayablesTable } from "./payables-table";
import { ReceivablesTable } from "./receivables-table";

type PaginatedDataUnion =
  | { data: ReceivableAccount[]; pageCount: number; totalCount: number }
  | { data: PayableAccount[]; pageCount: number; totalCount: number };

type CollectionsTabsProps = {
  orgSlug: string;
  wholesaleEnabled: boolean;
  currentTab: CollectionTabValue;
  creditOnlyCustomers: CustomerCreditEntry[];
  fullReceivables: ReceivableAccount[];
  fullPayables: PayableAccount[];
  paymentAccountId?: string;
  paginatedData: PaginatedDataUnion | null;
};

const tabQueryValues: Record<CollectionTabValue, string | null> = {
  receivables: null,
  payables: "cxp",
  "current-customers": "cc-clientes",
  "current-suppliers": "cc-proveedores",
};

export function CollectionsTabs({
  orgSlug,
  wholesaleEnabled,
  currentTab,
  creditOnlyCustomers,
  fullReceivables,
  fullPayables,
  paymentAccountId,
  paginatedData,
}: CollectionsTabsProps) {
  const [, setVista] = useQueryState(
    "vista",
    parseAsString.withOptions({
      clearOnDefault: false,
      history: "replace",
      shallow: false,
      scroll: false,
    })
  );

  const handleTabChange = (value: string) => {
    setVista(tabQueryValues[value as CollectionTabValue]);
  };

  return (
    <Tabs className="w-full" onValueChange={handleTabChange} value={currentTab}>
      <TabsList>
        {wholesaleEnabled ? (
          <TabsTrigger value="receivables">
            <PiggyBankIcon
              className="mr-2 h-4 w-4 text-green-500"
              weight="duotone"
            />
            Por cobrar
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="payables">
          <HandCoinsIcon
            className="mr-2 h-4 w-4 text-orange-500"
            weight="duotone"
          />
          Por pagar
        </TabsTrigger>
        {wholesaleEnabled ? (
          <TabsTrigger value="current-customers">
            <UsersThreeIcon
              className="mr-2 h-4 w-4 text-blue-500"
              weight="duotone"
            />
            CC clientes
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="current-suppliers">
          <FactoryIcon
            className="mr-2 h-4 w-4 text-amber-500"
            weight="duotone"
          />
          CC proveedores
        </TabsTrigger>
      </TabsList>
      {wholesaleEnabled ? (
        <TabsContent className="mt-2" value="receivables">
          {paginatedData && currentTab === "receivables" ? (
            <ReceivablesTable
              initialData={paginatedData.data as ReceivableAccount[]}
              orgSlug={orgSlug}
              pageCount={paginatedData.pageCount}
              paymentAccountId={paymentAccountId}
            />
          ) : null}
        </TabsContent>
      ) : null}
      <TabsContent className="mt-2" value="payables">
        {paginatedData && currentTab === "payables" ? (
          <PayablesTable
            initialData={paginatedData.data as PayableAccount[]}
            orgSlug={orgSlug}
            pageCount={paginatedData.pageCount}
          />
        ) : null}
      </TabsContent>
      {wholesaleEnabled ? (
        <TabsContent className="mt-2" value="current-customers">
          <CurrentAccounts
            creditOnlyCustomers={creditOnlyCustomers}
            orgSlug={orgSlug}
            receivables={fullReceivables}
          />
        </TabsContent>
      ) : null}
      <TabsContent className="mt-2" value="current-suppliers">
        <CurrentAccounts orgSlug={orgSlug} payables={fullPayables} />
      </TabsContent>
    </Tabs>
  );
}
