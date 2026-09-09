import { createAdminClient } from "@/lib/supabase/admin-client";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export type WhatsAppInboxConversation = {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: "ACTIVE" | "PAUSED" | "HANDOFF" | "CLOSED";
  handoffReason: string | null;
  lastMessageAt: string | null;
  lastMessage: {
    direction: "INBOUND" | "OUTBOUND";
    content: string | null;
  } | null;
  currentPreSaleId: string | null;
};

type ConversationRow = {
  id: string;
  customer_phone: string;
  customer_id: string | null;
  status: WhatsAppInboxConversation["status"];
  handoff_reason: string | null;
  last_message_at: string | null;
  current_pre_sale_id: string | null;
};

export async function getWhatsAppInboxByOrgSlug(
  orgSlug: string
): Promise<WhatsAppInboxConversation[]> {
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    throw new Error("Organización no encontrada");
  }

  const supabase = createAdminClient();
  const { data: conversations, error } = await supabase
    .from("whatsapp_conversations")
    .select(
      "id, customer_phone, customer_id, status, handoff_reason, last_message_at, current_pre_sale_id"
    )
    .eq("organization_id", organization.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    throw new Error(`No se pudo cargar el inbox de WhatsApp: ${error.message}`);
  }

  const rows = (conversations ?? []) as ConversationRow[];
  if (!rows.length) {
    return [];
  }
  const [customersResult, messagesResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, business_name, fantasy_name")
      .eq("organization_id", organization.id)
      .in(
        "id",
        rows
          .map((conversation) => conversation.customer_id)
          .filter((id): id is string => Boolean(id))
      ),
    supabase
      .from("whatsapp_messages")
      .select("conversation_id, direction, content, created_at")
      .eq("organization_id", organization.id)
      .in(
        "conversation_id",
        rows.map((conversation) => conversation.id)
      )
      .order("created_at", { ascending: false }),
  ]);
  if (customersResult.error || messagesResult.error) {
    throw new Error("No se pudo cargar el detalle de las conversaciones");
  }

  const customerNames = new Map(
    (customersResult.data ?? []).map((customer) => [
      customer.id,
      customer.fantasy_name || customer.business_name,
    ])
  );
  const latestMessages = new Map<
    string,
    { direction: "INBOUND" | "OUTBOUND"; content: string | null }
  >();
  for (const message of messagesResult.data ?? []) {
    if (!latestMessages.has(message.conversation_id)) {
      latestMessages.set(message.conversation_id, {
        direction: message.direction as "INBOUND" | "OUTBOUND",
        content: message.content,
      });
    }
  }

  return rows.map((conversation) => ({
    id: conversation.id,
    customerPhone: conversation.customer_phone,
    customerName: conversation.customer_id
      ? (customerNames.get(conversation.customer_id) ?? null)
      : null,
    status: conversation.status,
    handoffReason: conversation.handoff_reason,
    lastMessageAt: conversation.last_message_at,
    lastMessage: latestMessages.get(conversation.id) ?? null,
    currentPreSaleId: conversation.current_pre_sale_id,
  }));
}
