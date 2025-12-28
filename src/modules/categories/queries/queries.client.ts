import type { Category } from "../types";
import { categoriesQueryKey } from "./query-keys";

export const categoriesClientQueryOptions = (orgSlug: string) => ({
  queryKey: categoriesQueryKey(orgSlug),
  queryFn: async (): Promise<Category[]> => {
    const res = await fetch(`/api/org/${orgSlug}/categorias`);
    if (!res.ok) {
      throw new Error("Failed to fetch categories");
    }
    return res.json();
  },
});
