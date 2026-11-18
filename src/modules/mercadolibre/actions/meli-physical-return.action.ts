"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MeliConfirmationError } from "../errors";
import {
  createMeliPhysicalReturn,
  getMeliPhysicalReturnForm,
  listMeliPhysicalReturns,
  MeliPhysicalReturnError,
} from "../service/meli-physical-return.service";

function message(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Datos de devolución inválidos.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación de devolución Meli.";
}

export async function getMeliPhysicalReturnFormAction(
  orgSlug: string,
  saleId: string,
  page = 1
) {
  try {
    return {
      success: true as const,
      data: await getMeliPhysicalReturnForm(orgSlug, saleId, page),
    };
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
}

export async function getMeliPhysicalReturnHistoryAction(
  orgSlug: string,
  saleId: string,
  page = 1
) {
  try {
    return {
      success: true as const,
      data: await listMeliPhysicalReturns(orgSlug, saleId, page),
    };
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
}

export async function createMeliPhysicalReturnAction(
  orgSlug: string,
  input: unknown
) {
  try {
    const data = await createMeliPhysicalReturn(orgSlug, input);
    let refreshRequired = false;
    try {
      revalidatePath(
        `/org/${orgSlug}/venta-directa/mercado-libre/${data.saleId}`
      );
      revalidatePath(`/org/${orgSlug}/stock`);
    } catch {
      // Cache invalidation cannot undo a confirmed physical receipt.
      refreshRequired = true;
    }
    return { success: true as const, data, refreshRequired };
  } catch (error) {
    return {
      success: false as const,
      error: message(error),
      canEdit:
        error instanceof ZodError ||
        (error instanceof MeliConfirmationError && error.canEdit),
      requiresDefaultFallback:
        error instanceof MeliPhysicalReturnError &&
        error.requiresDefaultFallback,
    };
  }
}
