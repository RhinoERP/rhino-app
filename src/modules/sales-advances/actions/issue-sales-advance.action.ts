"use server";
import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "@/modules/arca/errors";
import { issueSalesAdvance } from "../service/sales-advances.service";
import type { SalesAdvance } from "../types";
import { issueSalesAdvanceSchema } from "../types";

export type IssueSalesAdvanceActionResult =
  | { success: true; data: SalesAdvance }
  | { success: false; error: string };

export async function issueSalesAdvanceAction(input: unknown) {
  const parsed = issueSalesAdvanceSchema.parse(input);

  try {
    const result = await issueSalesAdvance(parsed);
    revalidatePath(`/org/${parsed.orgSlug}/ventas`);
    revalidatePath(`/org/${parsed.orgSlug}/ventas/${result.finalSalesOrderId}`);
    revalidatePath(
      `/org/${parsed.orgSlug}/ventas/${result.finalSalesOrderId}/anticipo`
    );
    revalidatePath(`/org/${parsed.orgSlug}/anticipos`);
    revalidatePath(`/org/${parsed.orgSlug}/cobranzas`);
    return {
      success: true,
      data: result,
    } satisfies IssueSalesAdvanceActionResult;
  } catch (error) {
    revalidatePath(`/org/${parsed.orgSlug}/ventas`);
    revalidatePath(`/org/${parsed.orgSlug}/anticipos`);
    return {
      success: false,
      error: toArcaUserMessage(error),
    } satisfies IssueSalesAdvanceActionResult;
  }
}
