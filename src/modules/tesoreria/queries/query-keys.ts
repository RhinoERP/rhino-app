export const tesoreriaKeys = {
  all: ["tesoreria"] as const,
  bankAccounts: (orgSlug: string) =>
    [...tesoreriaKeys.all, "bank-accounts", orgSlug] as const,
  movements: (orgSlug: string, filters?: Record<string, unknown>) =>
    [...tesoreriaKeys.all, "movements", orgSlug, filters] as const,
  checks: (orgSlug: string, status?: string) =>
    [...tesoreriaKeys.all, "checks", orgSlug, status] as const,
  liquidity: (orgSlug: string, date: string) =>
    [...tesoreriaKeys.all, "liquidity", orgSlug, date] as const,
};
