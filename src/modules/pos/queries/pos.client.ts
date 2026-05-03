import type { PosTerminal, PosTerminalProduct } from "../types";

const normalizeSearch = (value: string) => value.trim().toLowerCase();

export const posProductsSearchQueryKey = (
  orgSlug: string,
  search: string,
  limit = 20
) =>
  ["org", orgSlug, "pos", "products", normalizeSearch(search), limit] as const;

export const posTerminalsQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "pos", "terminals"] as const;

export const posProductsSearchClientQueryOptions = (params: {
  orgSlug: string;
  search: string;
  limit?: number;
}) => {
  const { orgSlug, search, limit = 20 } = params;

  return {
    queryKey: posProductsSearchQueryKey(orgSlug, search, limit),
    queryFn: async (): Promise<PosTerminalProduct[]> => {
      const urlParams = new URLSearchParams();
      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        urlParams.set("q", normalizedSearch);
      }

      urlParams.set("limit", String(limit));

      const res = await fetch(
        `/api/org/${orgSlug}/venta-directa/productos?${urlParams.toString()}`
      );

      if (!res.ok) {
        throw new Error("No se pudieron obtener productos para la caja.");
      }

      return res.json();
    },
    staleTime: 30_000,
  };
};

export const posTerminalsClientQueryOptions = (orgSlug: string) => ({
  queryKey: posTerminalsQueryKey(orgSlug),
  queryFn: async (): Promise<PosTerminal[]> => {
    const res = await fetch(`/api/org/${orgSlug}/configuracion/pos-terminals`);

    if (!res.ok) {
      throw new Error("No se pudieron obtener las terminales POS.");
    }

    return res.json();
  },
});
