import { Suspense } from "react";
import { LedgerTable } from "@/components/finances/ledger/ledger-table";
import { getPeriodFromParams } from "@/components/finances/shared/params-utils";
import { PeriodSelector } from "@/components/finances/shared/period-selector";
import { getLedgerAction } from "@/modules/finances/actions/get-ledger.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function LibroMayorPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const urlParams = new URLSearchParams(sp as Record<string, string>);
  const period = getPeriodFromParams(urlParams);

  const entries = await getLedgerAction(orgSlug, period);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {period.label} · {entries.length} movimientos
        </p>
        <Suspense>
          <PeriodSelector />
        </Suspense>
      </div>
      <LedgerTable entries={entries} periodLabel={period.label} />
    </div>
  );
}
