"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  cancelMeliPaymentPreparation,
  getMeliPreparationActor,
  inspectMeliPaymentDispatch,
  inspectMeliPaymentReversals,
  prepareMeliPayment,
  publishMeliPaymentComponent,
} from "../service/meli-payment-preparations.service";

function message(error: unknown): string {
  if (error instanceof ZodError) {
    return "Datos de preparación inválidos.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
}

export async function getMeliPreparationActorAction(orgSlug: string) {
  try {
    return {
      success: true as const,
      data: await getMeliPreparationActor(orgSlug),
    };
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
}

export async function inspectMeliPaymentReversalsAction(
  orgSlug: string,
  paymentId: string
) {
  try {
    const data = await inspectMeliPaymentReversals(orgSlug, paymentId);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
}

export async function inspectMeliPaymentDispatchAction(
  orgSlug: string,
  input: unknown
) {
  try {
    const data = await inspectMeliPaymentDispatch(orgSlug, input);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
}

export async function publishMeliPaymentComponentAction(
  orgSlug: string,
  input: unknown
) {
  let data: Awaited<ReturnType<typeof publishMeliPaymentComponent>>;
  try {
    data = await publishMeliPaymentComponent(orgSlug, input);
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
  try {
    revalidatePath(`/org/${orgSlug}/cobranzas`, "layout");
    return { success: true as const, data, refreshRequired: false };
  } catch {
    return { success: true as const, data, refreshRequired: true };
  }
}

export async function prepareMeliPaymentAction(
  orgSlug: string,
  input: unknown
) {
  let data: Awaited<ReturnType<typeof prepareMeliPayment>>;
  try {
    data = await prepareMeliPayment(orgSlug, input);
  } catch (error) {
    return {
      success: false as const,
      error: message(error),
    };
  }
  try {
    revalidatePath(`/org/${orgSlug}/cobranzas`, "layout");
    return { success: true as const, data, refreshRequired: false };
  } catch {
    return { success: true as const, data, refreshRequired: true };
  }
}

export async function cancelMeliPaymentPreparationAction(
  orgSlug: string,
  preparationId: string
) {
  let data: Awaited<ReturnType<typeof cancelMeliPaymentPreparation>>;
  try {
    data = await cancelMeliPaymentPreparation(orgSlug, preparationId);
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
  try {
    revalidatePath(`/org/${orgSlug}/cobranzas`, "layout");
    return { success: true as const, data, refreshRequired: false };
  } catch {
    return { success: true as const, data, refreshRequired: true };
  }
}
