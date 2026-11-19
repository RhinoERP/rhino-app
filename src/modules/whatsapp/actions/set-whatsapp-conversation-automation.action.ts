"use server";

import { z } from "zod";
import { controlWhatsAppConversationAction } from "./control-whatsapp-conversation.action";

const inputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  conversationId: z.string().uuid(),
  expectedControlVersion: z.number().int().nonnegative(),
  enabled: z.boolean(),
});

export async function setWhatsAppConversationAutomationAction(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Actualizá la conversación antes de cambiar el control",
    };
  }
  const { enabled, ...control } = parsed.data;
  return await controlWhatsAppConversationAction({
    ...control,
    operation: enabled ? "RESUME" : "PAUSE",
  });
}
