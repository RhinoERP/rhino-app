import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersQueryKey } from "@/modules/customers/queries/query-keys";
import { assignCustomerToSalesList } from "@/modules/sales-price-lists/actions/assign-customer.action";
import { salesPriceListsQueryKey } from "@/modules/sales-price-lists/queries/query-keys";

type AssignCustomerVariables = {
  customerId: string;
};

export function useAssignCustomerMutation(orgSlug: string, listId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId }: AssignCustomerVariables) => {
      const result = await assignCustomerToSalesList({
        orgSlug,
        listId,
        customerId,
      });
      if (!result.success) {
        throw new Error(result.error ?? "Error al asignar cliente");
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Cliente asignado correctamente");
      queryClient.invalidateQueries({
        queryKey: salesPriceListsQueryKey(orgSlug),
      });
      queryClient.invalidateQueries({ queryKey: customersQueryKey(orgSlug) });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Error al asignar cliente"
      );
    },
  });
}
