"use server";

import { revalidatePath } from "next/cache";
import { WhatsAppControlAccessError } from "../server/conversation-control";
import {
  enqueueWhatsAppHumanMessage,
  humanMessageInputSchema,
  type WhatsAppCommandResult,
} from "../server/human-outbox";

export async function sendWhatsAppManualMessageAction(
  input: unknown
): Promise<WhatsAppCommandResult> {
  const parsed = humanMessageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "El envío requiere texto, clave y versión de control válidos.",
    };
  }
  try {
    const result = await enqueueWhatsAppHumanMessage(parsed.data);
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
          : "No se pudo registrar el envío.",
    };
  }
}
