"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LedgerMode } from "@/modules/finances/types";

type FinancialModeToggleProps = {
  className?: string;
};

export function FinancialModeToggle({ className }: FinancialModeToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: LedgerMode =
    searchParams.get("modo") === "caja" ? "caja" : "devengado";

  const setMode = useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("modo", v);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <Tabs className={className} onValueChange={setMode} value={mode}>
      <TabsList>
        <TabsTrigger value="devengado">Devengado</TabsTrigger>
        <TabsTrigger value="caja">Caja</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
