"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCustomerAction } from "../actions/create-customer.action";
import { updateCustomerAction } from "../actions/update-customer.action";
import { customersQueryKey } from "../queries/query-keys";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "../service/customers.service";

export function useCustomerMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createCustomer = useMutation({
    mutationFn: async (payload: Omit<CreateCustomerInput, "orgSlug">) => {
      const result = await createCustomerAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear el cliente");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customersQueryKey(orgSlug),
      });
    },
  });

  const updateCustomer = useMutation({
    mutationFn: async (
      payload: UpdateCustomerInput & { customerId: string }
    ) => {
      const result = await updateCustomerAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar el cliente");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customersQueryKey(orgSlug),
      });
    },
  });

  return {
    createCustomer,
    updateCustomer,
  };
}
