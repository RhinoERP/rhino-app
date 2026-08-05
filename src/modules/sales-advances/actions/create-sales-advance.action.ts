"use server";
import { revalidatePath } from "next/cache";
import { createSalesAdvance } from "../service/sales-advances.service";
import { createSalesAdvanceSchema } from "../types";
export async function createSalesAdvanceAction(input: unknown) {
  const parsed = createSalesAdvanceSchema.parse(input);
  const result = await createSalesAdvance(parsed);
  revalidatePath(`/org/${parsed.orgSlug}/ventas/${parsed.finalSalesOrderId}`);
  revalidatePath(
    `/org/${parsed.orgSlug}/ventas/${parsed.finalSalesOrderId}/anticipo`
  );
  revalidatePath(`/org/${parsed.orgSlug}/anticipos`);
  return result;
}
