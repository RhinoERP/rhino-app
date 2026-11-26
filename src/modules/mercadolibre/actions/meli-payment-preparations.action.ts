"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import {
  cancelMeliPaymentPreparation,
  getMeliPreparationActor,
  inspectMeliPaymentDispatch,
  inspectMeliPaymentReversals,
  listMeliPaymentPreparations,
  prepareMeliPayment,
  publishMeliPaymentComponent,
} from "../service/meli-payment-preparations.service";
import { publishPendingPaymentComponents } from "../utils/publish-payment-components";

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

export async function publishMeliPaymentPreparationAction(
  orgSlug: string,
  input: unknown
) {
  let result: Awaited<ReturnType<typeof publishPendingPaymentComponents>>;
  try {
    const { paymentId, preparationId } = z
      .object({ paymentId: z.uuid(), preparationId: z.uuid() })
      .strict()
      .parse(input);
    const preparations = await listMeliPaymentPreparations(orgSlug, paymentId);
    const preparation = preparations.find(
      (item) =>
        item.id.toLowerCase() === preparationId.toLowerCase() &&
        item.status === "PREPARED"
    );
    if (!preparation || preparation.components.length === 0) {
      throw new Error("No se encontró una preparación vigente con conceptos.");
    }
    result = await publishPendingPaymentComponents(
      preparation.components,
      (componentKey) =>
        publishMeliPaymentComponent(orgSlug, {
          paymentId,
          preparationId,
          componentKey,
        })
    );
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
  let refreshRequired = false;
  try {
    revalidatePath(`/org/${orgSlug}/cobranzas`, "layout");
  } catch {
    refreshRequired = true;
  }
  if (!result.success) {
    return {
      success: false as const,
      error: `No se completó la publicación de ${result.failedComponent}. Motivo: ${message(result.error)} Se confirmaron ${result.confirmed} conceptos en este intento; revisá los estados y reintentá con la misma preparación.`,
      refreshRequired,
    };
  }
  return {
    success: true as const,
    confirmed: result.confirmed,
    refreshRequired,
  };
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
