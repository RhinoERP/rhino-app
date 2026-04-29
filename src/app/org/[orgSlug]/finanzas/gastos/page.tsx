import { PlusIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Suspense } from "react";
import { ExpenseList } from "@/components/finances/expenses/expense-list";
import { getPeriodFromParams } from "@/components/finances/shared/params-utils";
import { PeriodSelector } from "@/components/finances/shared/period-selector";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { getExpenseCategoriesAction } from "@/modules/finances/actions/get-expense-categories.action";
import { getExpensesAction } from "@/modules/finances/actions/get-expenses.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function GastosPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const urlParams = new URLSearchParams(sp as Record<string, string>);
  const period = getPeriodFromParams(urlParams);

  const [expenses, categories] = await Promise.all([
    getExpensesAction(orgSlug, { from: period.from, to: period.to }),
    getExpenseCategoriesAction(orgSlug),
  ]);

  const expensesWithCategories = expenses.map((e) => ({
    ...e,
    category: categories.find((c) => c.id === e.category_id) ?? null,
  }));

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense>
            <PeriodSelector />
          </Suspense>
          {expenses.length > 0 && (
            <span className="text-muted-foreground text-sm">
              {expenses.length} gastos · Total: {formatCurrency(total)}
            </span>
          )}
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/finanzas/gastos/nuevo`}>
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nuevo gasto
          </Link>
        </Button>
      </div>

      <ExpenseList expenses={expensesWithCategories} orgSlug={orgSlug} />
    </div>
  );
}
