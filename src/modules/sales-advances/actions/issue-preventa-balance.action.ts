"use server";

import { revalidatePath } from "next/cache";
import { issuePreventaBalanceInvoice } from "../service/sales-advances.service";
import { issuePreventaBalanceSchema } from "../types";

export async function issuePreventaBalanceAction(input: unknown) {
  const parsed = issuePreventaBalanceSchema.parse(input);
  const result = await issuePreventaBalanceInvoice(parsed);
  revalidatePath(`/org/${parsed.orgSlug}/ventas/${parsed.preventaId}`);
  revalidatePath(`/org/${parsed.orgSlug}/ventas/${result.balanceSalesOrderId}`);
  revalidatePath(`/org/${parsed.orgSlug}/anticipos`);
  return result;
}
