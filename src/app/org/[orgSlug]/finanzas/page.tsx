import { Suspense } from "react";
import { ExpensesBreakdown } from "@/components/finances/dashboard/expenses-breakdown";
import { PendingPosition } from "@/components/finances/dashboard/pending-position";
import { ResultsSummary } from "@/components/finances/dashboard/results-summary";
import { getPeriodFromParams } from "@/components/finances/shared/params-utils";
import { PeriodSelector } from "@/components/finances/shared/period-selector";
import { getFinancialResultsAction } from "@/modules/finances/actions/get-financial-results.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function FinanzasDashboardPage({
  params,
  searchParams,
}: Props) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const urlParams = new URLSearchParams(sp as Record<string, string>);
  const period = getPeriodFromParams(urlParams);

  const results = await getFinancialResultsAction(orgSlug, period);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {period.label}: {period.from} → {period.to}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Suspense>
            <PeriodSelector />
          </Suspense>
        </div>
      </div>

      <ResultsSummary results={results} />

      <div className="grid gap-4 lg:grid-cols-2">
        <PendingPosition results={results} />
        <ExpensesBreakdown results={results} />
      </div>
    </div>
  );
}
