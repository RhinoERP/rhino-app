"use server";

import type { Tax } from "../service/taxes.service";
import { type CreateTaxInput, createTaxForOrg } from "../service/taxes.service";

export type CreateTaxActionResult = {
  success: boolean;
  error?: string;
  tax?: Tax;
};

export type CreateTaxActionParams = {
  orgSlug: string;
  name: string;
  rate: number;
  code?: string | null;
  description?: string | null;
};

export async function createTaxAction(
  params: CreateTaxActionParams
): Promise<CreateTaxActionResult> {
  try {
    const taxInput: CreateTaxInput = {
      orgSlug: params.orgSlug,
      name: params.name,
      rate: params.rate,
      code: params.code,
      description: params.description,
    };

    const tax = await createTaxForOrg(taxInput);

    return {
      success: true,
      tax,
    };
  } catch (error) {
    console.error("Error creating tax:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el impuesto",
    };
  }
}
