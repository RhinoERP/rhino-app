"use server";

import { getCommissionsPaginated } from "../service/commissions.service";
import type { CommissionsPaginatedParams } from "../types";

export async function getCommissionsPageAction(
  orgSlug: string,
  params: CommissionsPaginatedParams
) {
  return await getCommissionsPaginated(orgSlug, params);
}
