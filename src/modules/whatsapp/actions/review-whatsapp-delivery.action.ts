"use server";

import { revalidatePath } from "next/cache";
import { WhatsAppControlAccessError } from "../server/conversation-control";
import {
  deliveryReviewInputSchema,
  reviewWhatsAppDelivery,
  type WhatsAppCommandResult,
} from "../server/human-outbox";

export async function reviewWhatsAppDeliveryAction(
  input: unknown
): Promise<WhatsAppCommandResult> {
  const parsed = deliveryReviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "La revisión requiere versión, resolución y motivo válidos.",
    };
  }
  try {
    const result = await reviewWhatsAppDelivery(parsed.data);
    if (result.success) {
      revalidatePath(`/org/${parsed.data.orgSlug}/whatsapp/conversaciones`);
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof WhatsAppControlAccessError
          ? error.message
          : "No se pudo registrar la revisión.",
    };
  }
}
