import type { Carrier } from "../service/carriers.service";
import { carriersQueryKey } from "./query-keys";

export const carriersClientQueryOptions = (orgSlug: string) => ({
  queryKey: carriersQueryKey(orgSlug),
  queryFn: async (): Promise<Carrier[]> => {
    const res = await fetch(`/api/org/${orgSlug}/carriers`);
    if (!res.ok) {
      throw new Error("Failed to fetch carriers");
    }
    return res.json();
  },
});
