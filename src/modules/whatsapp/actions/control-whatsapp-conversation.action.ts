"use server";

import { revalidatePath } from "next/cache";
import {
  controlWhatsAppConversation,
  conversationControlInputSchema,
  WhatsAppControlAccessError,
  type WhatsAppControlResult,
} from "../server/conversation-control";

export async function controlWhatsAppConversationAction(
  input: unknown
): Promise<WhatsAppControlResult> {
  const parsed = conversationControlInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "La operación de control no es válida" };
  }
  try {
    const result = await controlWhatsAppConversation(parsed.data);
    if (result.control) {
      revalidatePath(`/org/${parsed.data.orgSlug}/whatsapp/conversaciones`);
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof WhatsAppControlAccessError
          ? error.message
          : "No se pudo actualizar el control de la conversación",
    };
  }
}
