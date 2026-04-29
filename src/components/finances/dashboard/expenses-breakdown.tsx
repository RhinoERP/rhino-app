import { formatCurrency } from "@/lib/format";
import type { FinancialResults } from "@/modules/finances/types";

type ExpensesBreakdownProps = {
  results: FinancialResults;
};

export function ExpensesBreakdown({ results }: ExpensesBreakdownProps) {
  const total = results.totalExpenses;
  const byCategory = results.expensesByCategory;

  if (byCategory.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="mb-4 font-semibold text-sm">
        Gastos operativos por categoría
      </h3>
      <div className="space-y-3">
        {byCategory.map((cat) => {
          const pct = total > 0 ? (cat.amount / total) * 100 : 0;
          return (
            <div key={cat.categoryId ?? "sin-categoria"}>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {cat.color && (
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  <span>{cat.categoryName}</span>
                  {cat.isFixed && (
                    <span className="text-muted-foreground text-xs">
                      (Fijo)
                    </span>
                  )}
                </div>
                <span className="font-medium font-mono">
                  {formatCurrency(cat.amount)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
