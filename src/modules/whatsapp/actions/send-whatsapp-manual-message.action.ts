"use server";

// Human sends must not bypass the conversation lock via the legacy direct POST.
// Re-enable only with the common, idempotent outbox (human inbox phase 2).
// biome-ignore lint/suspicious/useAwait: Next.js server actions must be async.
export async function sendWhatsAppManualMessageAction(
  _input: unknown
): Promise<{
  success: boolean;
  error?: string;
}> {
  return {
    success: false,
    error:
      "El envío manual estará disponible al habilitar la outbox humana persistente",
  };
}
