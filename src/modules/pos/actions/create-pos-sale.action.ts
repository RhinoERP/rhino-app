"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { createPosSale } from "../service/pos.service";
import {
  type CreatePosSaleInput,
  type CreatePosSaleResult,
  createPosSaleSchema,
} from "../types";

export type CreatePosSaleActionResult = {
  success: boolean;
  posSaleId?: string;
  accountingStatus?: CreatePosSaleResult["accountingStatus"];
  accountingSalePayload?: CreatePosSaleResult["accountingSalePayload"];
  accountingPaymentPayload?: CreatePosSaleResult["accountingPaymentPayload"];
  error?: string;
};

export async function createPosSaleAction(
  input: CreatePosSaleInput
): Promise<CreatePosSaleActionResult> {
  await ensure("pos.manage", input.orgSlug);
  const parsed = createPosSaleSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      success: false,
      error: issue?.message ?? "Datos inválidos para registrar la venta POS.",
    };
  }

  try {
    const result = await createPosSale(parsed.data);

    return {
      success: true,
      posSaleId: result.posSaleId,
      accountingStatus: result.accountingStatus,
      accountingSalePayload: result.accountingSalePayload ?? null,
      accountingPaymentPayload: result.accountingPaymentPayload ?? null,
    };
  } catch (error) {
    console.error("Error creating POS sale:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al registrar la venta POS.",
    };
  }
}
