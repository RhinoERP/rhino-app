"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MeliConfirmationError } from "../errors";
import {
  createMeliPayment,
  voidMeliPayment,
} from "../service/meli-payments.service";

function refresh(orgSlug: string, saleId: string | null) {
  try {
    revalidatePath(`/org/${orgSlug}/cobranzas`, "layout");
    if (saleId) {
      revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}`);
    }
    return false;
  } catch {
    return true;
  }
}

function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo registrar la operación de cobro.";
}

function failure(error: unknown) {
  return {
    success: false as const,
    error: errorMessage(error),
    canEdit:
      error instanceof ZodError ||
      (error instanceof MeliConfirmationError && error.canEdit),
  };
}

export async function createMeliPaymentAction(orgSlug: string, input: unknown) {
  try {
    const data = await createMeliPayment(orgSlug, input);
    return {
      success: true as const,
      data,
      refreshRequired: refresh(orgSlug, data.saleId),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function voidMeliPaymentAction(orgSlug: string, input: unknown) {
  try {
    const data = await voidMeliPayment(orgSlug, input);
    return {
      success: true as const,
      data,
      refreshRequired: refresh(orgSlug, data.saleId),
    };
  } catch (error) {
    return failure(error);
  }
}
