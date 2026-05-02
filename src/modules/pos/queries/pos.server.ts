import { getPosTerminalsByOrgSlug } from "../service/pos-terminals.service";
import { posTerminalsQueryKey } from "./pos.client";

export const posTerminalsServerQueryOptions = (orgSlug: string) => ({
  queryKey: posTerminalsQueryKey(orgSlug),
  queryFn: () => getPosTerminalsByOrgSlug(orgSlug),
});
