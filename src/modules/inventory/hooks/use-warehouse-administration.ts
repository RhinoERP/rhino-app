"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  replaceWarehouseAssignmentsAction,
  saveWarehouseAction,
} from "../actions/warehouse-administration.actions";
import { warehouseAdministrationQueryKey } from "../queries/warehouse-administration.queries";
import type {
  ReplaceWarehouseAssignmentsInput,
  SaveWarehouseInput,
} from "../warehouse-admin.types";

export function useWarehouseAdministration(orgSlug: string) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    const prefixes = [
      "inventory-warehouses",
      "pos-warehouses",
      "quote-warehouses",
      "purchase-receipt-warehouses",
      "inventory-variant-stock",
      "direct-sale-products",
    ];
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: warehouseAdministrationQueryKey(orgSlug),
      }),
      ...prefixes.map((prefix) =>
        queryClient.invalidateQueries({ queryKey: [prefix, orgSlug] })
      ),
    ]);
  };
  const saveWarehouse = useMutation({
    mutationFn: async (values: Omit<SaveWarehouseInput, "orgSlug">) => {
      const result = await saveWarehouseAction({ ...values, orgSlug });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.warehouseId;
    },
    onSuccess: refresh,
  });
  const replaceAssignments = useMutation({
    mutationFn: async (
      values: Omit<ReplaceWarehouseAssignmentsInput, "orgSlug">
    ) => {
      const result = await replaceWarehouseAssignmentsAction({
        ...values,
        orgSlug,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    onSuccess: refresh,
  });
  return { saveWarehouse, replaceAssignments };
}
