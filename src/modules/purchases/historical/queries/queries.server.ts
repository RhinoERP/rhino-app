import { queryOptions } from "@tanstack/react-query";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getHistoricalPurchaseMetrics } from "../service/queries.service";
import { historicalPurchasesQueryKeys } from "./query-keys";

export const historicalPurchasesQueryOptions = async (
  orgSlug: string,
  startDate?: Date,
  endDate?: Date
) => {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organization not found");
  }

  return queryOptions({
    queryKey: historicalPurchasesQueryKeys.list(orgSlug, startDate, endDate),
    queryFn: () => getHistoricalPurchaseMetrics(org.id, startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
