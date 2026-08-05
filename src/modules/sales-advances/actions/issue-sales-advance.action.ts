"use server";
import { revalidatePath } from "next/cache";
import { issueSalesAdvance } from "../service/sales-advances.service";
import { issueSalesAdvanceSchema } from "../types";
export async function issueSalesAdvanceAction(input: unknown) {
  const parsed = issueSalesAdvanceSchema.parse(input);
  const result = await issueSalesAdvance(parsed);
  revalidatePath(`/org/${parsed.orgSlug}/ventas`);
  revalidatePath(`/org/${parsed.orgSlug}/ventas/${result.finalSalesOrderId}`);
  revalidatePath(
    `/org/${parsed.orgSlug}/ventas/${result.finalSalesOrderId}/anticipo`
  );
  revalidatePath(`/org/${parsed.orgSlug}/anticipos`);
  revalidatePath(`/org/${parsed.orgSlug}/cobranzas`);
  return result;
}
