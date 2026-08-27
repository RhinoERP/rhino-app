"use client";

import {
  FactoryIcon,
  HandCoinsIcon,
  PiggyBankIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
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
  orgId?: string;
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
  orgId,
  wholesaleEnabled,
  currentTab,
  creditOnlyCustomers,
  fullReceivables,
  fullPayables,
  paymentAccountId,
  paginatedData,
}: CollectionsTabsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const prevTabRef = useRef(currentTab);

  const [, setVista] = useQueryState(
    "vista",
    parseAsString.withOptions({
      clearOnDefault: false,
      history: "replace",
      shallow: false,
      scroll: false,
    })
  );

  useEffect(() => {
    if (prevTabRef.current !== currentTab) {
      prevTabRef.current = currentTab;
      setIsLoading(false);
    }
  });

  const handleTabChange = (value: string) => {
    setIsLoading(true);
    setVista(tabQueryValues[value as CollectionTabValue]);
  };

  return (
    <Tabs className="w-full" onValueChange={handleTabChange} value={currentTab}>
      <TabsList>
        {wholesaleEnabled ? (
          <TabsTrigger
            className="cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
            value="receivables"
          >
            <PiggyBankIcon
              className="mr-2 h-4 w-4 text-green-500"
              weight="duotone"
            />
            Por cobrar
          </TabsTrigger>
        ) : null}
        <TabsTrigger
          className="cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
          value="payables"
        >
          <HandCoinsIcon
            className="mr-2 h-4 w-4 text-orange-500"
            weight="duotone"
          />
          Por pagar
        </TabsTrigger>
        {wholesaleEnabled ? (
          <TabsTrigger
            className="cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
            value="current-customers"
          >
            <UsersThreeIcon
              className="mr-2 h-4 w-4 text-blue-500"
              weight="duotone"
            />
            CC clientes
          </TabsTrigger>
        ) : null}
        <TabsTrigger
          className="cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
          value="current-suppliers"
        >
          <FactoryIcon
            className="mr-2 h-4 w-4 text-amber-500"
            weight="duotone"
          />
          CC proveedores
        </TabsTrigger>
      </TabsList>
      {wholesaleEnabled ? (
        <TabsContent className="mt-2" value="receivables">
          {isLoading ? (
            <DataTableSkeleton columnCount={7} filterCount={1} rowCount={8} />
          ) : (
            paginatedData &&
            currentTab === "receivables" && (
              <ReceivablesTable
                initialData={paginatedData.data as ReceivableAccount[]}
                orgSlug={orgSlug}
                pageCount={paginatedData.pageCount}
                paymentAccountId={paymentAccountId}
              />
            )
          )}
        </TabsContent>
      ) : null}
      <TabsContent className="mt-2" value="payables">
        {isLoading ? (
          <DataTableSkeleton columnCount={7} filterCount={1} rowCount={8} />
        ) : (
          paginatedData &&
          currentTab === "payables" && (
            <PayablesTable
              initialData={paginatedData.data as PayableAccount[]}
              orgId={orgId}
              orgSlug={orgSlug}
              pageCount={paginatedData.pageCount}
            />
          )
        )}
      </TabsContent>
      {wholesaleEnabled ? (
        <TabsContent className="mt-2" value="current-customers">
          {isLoading ? (
            <DataTableSkeleton columnCount={7} filterCount={1} rowCount={8} />
          ) : (
            <CurrentAccounts
              creditOnlyCustomers={creditOnlyCustomers}
              orgSlug={orgSlug}
              receivables={fullReceivables}
            />
          )}
        </TabsContent>
      ) : null}
      <TabsContent className="mt-2" value="current-suppliers">
        {isLoading ? (
          <DataTableSkeleton columnCount={7} filterCount={1} rowCount={8} />
        ) : (
          <CurrentAccounts orgSlug={orgSlug} payables={fullPayables} />
        )}
      </TabsContent>
    </Tabs>
  );
}
