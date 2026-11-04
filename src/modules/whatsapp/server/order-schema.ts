import { createWhatsAppAdminClient } from "./supabase-admin";

type DatabaseError = { code?: string; message: string };
const missingSchemaCodes = new Set([
  "42703",
  "42P01",
  "PGRST204",
  "PGRST205",
  "PGRST202",
]);
export const whatsappSchemaUpdateMessage =
  "Falta actualizar la base de datos de WhatsApp. Un administrador debe completar el despliegue antes de usar el agente o el simulador.";

/** Keep provider diagnostics server-side while distinguishing a missing rollout. */
export function throwIfWhatsAppSchemaError(error: DatabaseError | null): void {
  if (!(error && missingSchemaCodes.has(error.code ?? ""))) {
    return;
  }
  console.error(
    "[whatsapp] Pedidos recurrentes: falta aplicar 20261027000000_whatsapp_recurring_orders.sql",
    {
      code: error.code,
      message: error.message,
    }
  );
  throw new Error(whatsappSchemaUpdateMessage);
}

/** Read-only preflight: fail before creating a sandbox session or saving a message. */
export async function assertWhatsAppOrderSchema(): Promise<void> {
  const client = createWhatsAppAdminClient();
  const results = await Promise.all([
    client
      .from("whatsapp_conversations")
      .select("pending_order_action, automation_resumed_at")
      .limit(0),
    client
      .from("conversation_carts")
      .select("version, quote_snapshot, last_source_message_id")
      .limit(0),
    client.from("sales_orders").select("whatsapp_cart_id").limit(0),
  ]);
  for (const { error } of results) {
    throwIfWhatsAppSchemaError(error);
    if (error) {
      throw new Error(
        "No se pudo comprobar la configuración de WhatsApp. Volvé a intentar más tarde."
      );
    }
  }
}
