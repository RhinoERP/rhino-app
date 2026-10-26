"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmPosSaleAccountingAction } from "../actions/confirm-pos-sale-accounting.action";
import { getPosSalesAccountingInboxAction } from "../actions/get-pos-sales-accounting-inbox.action";
import { retryPosSaleAccountingAction } from "../actions/retry-pos-sale-accounting.action";
import type { PosAccountingInboxStatus } from "../utils/accounting-inbox";

const inboxBaseKey = (orgSlug: string) =>
  ["org", orgSlug, "pos", "accounting-inbox"] as const;

export function usePosSalesAccountingInbox(
  orgSlug: string,
  status?: PosAccountingInboxStatus
) {
  return useQuery({
    queryKey: [...inboxBaseKey(orgSlug), status ?? "all"] as const,
    queryFn: () => getPosSalesAccountingInboxAction({ orgSlug, status }),
  });
}

export function usePosSalesAccountingInboxMutations(orgSlug: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: inboxBaseKey(orgSlug) });

  const retry = useMutation({
    mutationFn: async (posSaleIds: string[]) => {
      const result = await retryPosSaleAccountingAction({
        orgSlug,
        posSaleIds,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.results;
    },
    onSettled: invalidate,
  });

  const confirm = useMutation({
    mutationFn: async (params: {
      posSaleId: string;
      informalEntryId: string;
    }) => {
      const result = await confirmPosSaleAccountingAction({
        orgSlug,
        ...params,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    },
    onSettled: invalidate,
  });

  return { retry, confirm };
}
