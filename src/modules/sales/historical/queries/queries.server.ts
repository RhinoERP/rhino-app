import { queryOptions } from "@tanstack/react-query";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getHistoricalSalesMetrics } from "../service/queries.service";
import { historicalSalesQueryKeys } from "./query-keys";

export const historicalSalesQueryOptions = (
  orgSlug: string,
  startDate?: Date,
  endDate?: Date
) =>
  queryOptions({
    queryKey: historicalSalesQueryKeys.list(orgSlug, startDate, endDate),
    queryFn: async () => {
      const org = await getOrganizationBySlug(orgSlug);
      if (!org?.id) {
        throw new Error("Organization not found");
      }
      return getHistoricalSalesMetrics(org.id, startDate, endDate);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
