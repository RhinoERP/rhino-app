import type { GetPosSaleReturnableItemsResult } from "../types";
import { posSaleReturnableItemsQueryKey } from "./query-keys";

export const posSaleReturnableItemsClientQueryOptions = (params: {
  orgSlug: string;
  posSaleId: string;
}) => {
  const { orgSlug, posSaleId } = params;

  return {
    queryKey: posSaleReturnableItemsQueryKey(orgSlug, posSaleId),
    queryFn: async (): Promise<GetPosSaleReturnableItemsResult> => {
      const response = await fetch(
        `/api/org/${orgSlug}/venta-directa/${posSaleId}/items`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          errorPayload?.error ??
            "No se pudieron obtener ítems retornables de la venta POS."
        );
      }

      return response.json();
    },
    staleTime: 15_000,
  };
};
