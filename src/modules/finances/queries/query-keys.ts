export const financeKeys = {
  all: (orgSlug: string) => ["finances", orgSlug] as const,
  results: (orgSlug: string, mode: string, from: string, to: string) =>
    ["finances", orgSlug, "results", mode, from, to] as const,
  ledger: (orgSlug: string, mode: string, from: string, to: string) =>
    ["finances", orgSlug, "ledger", mode, from, to] as const,
  expenses: (orgSlug: string) => ["finances", orgSlug, "expenses"] as const,
  expense: (orgSlug: string, id: string) =>
    ["finances", orgSlug, "expenses", id] as const,
  categories: (orgSlug: string) => ["finances", orgSlug, "categories"] as const,
};
