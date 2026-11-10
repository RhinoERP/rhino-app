import { z } from "zod";
import { getWhatsAppUserAccess } from "./conversation-control";
import { createWhatsAppAdminClient } from "./supabase-admin";

const conversationInput = z.object({
  orgSlug: z.string().trim().min(1),
  conversationId: z.string().uuid(),
  expectedControlVersion: z.number().int().nonnegative(),
});
export const humanMessageInputSchema = conversationInput.extend({
  clientRequestId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});
export const deliveryReviewInputSchema = conversationInput
  .extend({
    commandId: z.string().uuid(),
    resolution: z.enum(["SENT", "CANCELLED"]),
    reason: z.string().trim().min(5).max(1000),
    externalMessageId: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((input) =>
    input.resolution === "SENT"
      ? Boolean(input.externalMessageId)
      : input.externalMessageId === undefined
  );

const commandSchema = z.object({
  id: z.string().uuid(),
  clientRequestId: z.string().uuid().nullable(),
  status: z.enum(["PENDING", "SENDING", "SENT", "UNKNOWN", "CANCELLED"]),
  reasonCode: z
    .enum([
      "DELIVERY_UNKNOWN",
      "CHANNEL_UNAVAILABLE",
      "ACCESS_REVOKED",
      "CONTROL_CONFLICT",
      "WINDOW_EXPIRED",
      "RETRY_EXHAUSTED",
      "PROVIDER_REJECTED",
    ])
    .nullable(),
  messageId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const errors = {
  IDEMPOTENCY_CONFLICT: "La clave de envío ya corresponde a otra solicitud.",
  CONTROL_CONFLICT: "El control cambió. Revisá quién atiende antes de enviar.",
  DELIVERY_UNRESOLVED:
    "Hay un envío en curso o sin confirmar. Revisalo antes de enviar.",
  WINDOW_EXPIRED:
    "Venció la ventana de 24 horas desde el último mensaje del cliente.",
  REVIEW_CONFLICT: "El envío ya no está pendiente de revisión.",
} as const;
const resultSchema = z.object({
  success: z.boolean(),
  code: z
    .enum(
      Object.keys(errors) as [keyof typeof errors, ...(keyof typeof errors)[]]
    )
    .optional(),
  replayed: z.boolean().optional(),
  command: commandSchema.optional(),
});
export type WhatsAppCommandResult = z.infer<typeof resultSchema> & {
  error?: string;
};

export async function guardedDispatchReady(
  db: ReturnType<typeof createWhatsAppAdminClient>
) {
  const { data, error } = await db.rpc("whatsapp_guarded_dispatch_ready");
  return !error && data === true;
}

async function runCommand(
  orgSlug: string,
  name: "enqueue_whatsapp_human_message" | "resolve_whatsapp_unknown",
  args: Record<string, unknown>
): Promise<WhatsAppCommandResult> {
  const { organization, userId } = await getWhatsAppUserAccess(
    orgSlug,
    "whatsapp.manage"
  );
  const db = createWhatsAppAdminClient();
  const ready =
    name === "enqueue_whatsapp_human_message"
      ? await guardedDispatchReady(db)
      : await db
          .rpc("whatsapp_human_outbox_protocol_version")
          .then((protocol) => !protocol.error && protocol.data === 1);
  if (!ready) {
    return {
      success: false,
      error: "La outbox humana requiere completar la migración compatible.",
    };
  }
  const { data, error } = await db.rpc(name, {
    ...args,
    p_organization_id: organization.id,
    p_actor_id: userId,
  });
  if (error) {
    return {
      success: false,
      error:
        error.code === "42501"
          ? "La conversación no está disponible o el módulo está deshabilitado."
          : "No se pudo registrar la operación de envío.",
    };
  }
  // Explicit DTOs discard internal fields even if the database adds them later.
  const result = resultSchema.safeParse(data);
  if (!result.success || (result.data.success && !result.data.command)) {
    return {
      success: false,
      error: "No se pudo confirmar la operación de envío.",
    };
  }
  return {
    ...result.data,
    error: result.data.code ? errors[result.data.code] : undefined,
  };
}

export function enqueueWhatsAppHumanMessage(
  input: z.infer<typeof humanMessageInputSchema>
) {
  return runCommand(input.orgSlug, "enqueue_whatsapp_human_message", {
    p_conversation_id: input.conversationId,
    p_expected_control_version: input.expectedControlVersion,
    p_client_request_id: input.clientRequestId,
    p_text: input.text,
  });
}

export function reviewWhatsAppDelivery(
  input: z.infer<typeof deliveryReviewInputSchema>
) {
  return runCommand(input.orgSlug, "resolve_whatsapp_unknown", {
    p_conversation_id: input.conversationId,
    p_command_id: input.commandId,
    p_expected_control_version: input.expectedControlVersion,
    p_resolution: input.resolution,
    p_reason: input.reason,
    p_external_message_id: input.externalMessageId ?? null,
  });
}
