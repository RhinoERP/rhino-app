"use server";
import { revalidatePath } from "next/cache";
import { settleSalesAdvance } from "../service/sales-advances.service";
import { settleSalesAdvanceSchema } from "../types";
export async function settleSalesAdvanceAction(input: unknown) {
  const parsed = settleSalesAdvanceSchema.parse(input);
  const result = await settleSalesAdvance(parsed);
  revalidatePath(`/org/${parsed.orgSlug}/ventas`);
  revalidatePath(`/org/${parsed.orgSlug}/ventas/${result.finalSalesOrderId}`);
  revalidatePath(
    `/org/${parsed.orgSlug}/ventas/${result.finalSalesOrderId}/anticipo`
  );
  revalidatePath(`/org/${parsed.orgSlug}/anticipos`);
  revalidatePath(`/org/${parsed.orgSlug}/cobranzas`);
  revalidatePath(`/org/${parsed.orgSlug}/notas-de-credito`);
  return result;
}
