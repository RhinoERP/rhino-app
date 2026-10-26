import { createHash, randomUUID } from "node:crypto";
import { assertWhatsAppEnabled } from "./access";
import { createWhatsAppAdminClient } from "./supabase-admin";

const localSimulatorIntegrationPrefix = "rhinos-local-simulator:";
const localSimulatorPhonePrefix = "SIMULACIÓN LOCAL · ";

export type SimulationState = {
  organizationId: string;
  integrationId: string;
  conversationId: string;
  customerId: string;
};

export type SimulationOptions = {
  priceLists: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; label: string }>;
};

export type SimulationSnapshot = {
  cartItemCount: number;
  cartStatus: string;
  preSaleCreated: boolean;
  conversationStatus: string;
  handoffReason: string | null;
};

export function isLocalSimulatorIntegration(phoneNumberId: string): boolean {
  return phoneNumberId.startsWith(localSimulatorIntegrationPrefix);
}

export async function getWhatsAppSimulationOptions(
  organizationId: string
): Promise<SimulationOptions> {
  await assertWhatsAppEnabled(organizationId, "whatsapp_sandbox");
  const supabase = createWhatsAppAdminClient();
  const [priceListsResult, customersResult] = await Promise.all([
    supabase
      .from("sales_price_lists")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("customers")
      .select("id, business_name, fantasy_name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("business_name"),
  ]);

  if (priceListsResult.error) {
    throw new Error(
      `No se pudieron cargar las listas de precios: ${priceListsResult.error.message}`
    );
  }
  if (customersResult.error) {
    throw new Error(
      `No se pudieron cargar los clientes: ${customersResult.error.message}`
    );
  }

  return {
    priceLists: (priceListsResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
    })),
    customers: (customersResult.data ?? []).map((customer) => ({
      id: customer.id,
      label: customer.fantasy_name || customer.business_name,
    })),
  };
}

async function verifySimulationSelection(params: {
  organizationId: string;
  actorId: string;
  customerId: string;
  priceListId: string;
}): Promise<void> {
  const supabase = createWhatsAppAdminClient();
  const [memberResult, customerResult, priceListResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.actorId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("id", params.customerId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("sales_price_lists")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("id", params.priceListId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (memberResult.error || !memberResult.data) {
    throw new Error("Tu usuario no pertenece a esta organización");
  }
  if (customerResult.error || !customerResult.data) {
    throw new Error("El cliente elegido no está activo en esta organización");
  }
  if (priceListResult.error || !priceListResult.data) {
    throw new Error(
      "La lista de precios elegida no está activa en esta organización"
    );
  }
}

export async function createLocalSimulatorSession(params: {
  organizationId: string;
  actorId: string;
  customerId: string;
  priceListId: string;
}): Promise<SimulationState> {
  const supabase = createWhatsAppAdminClient();
  await assertWhatsAppEnabled(params.organizationId, "whatsapp_sandbox");
  await verifySimulationSelection(params);

  const integrationKey = createHash("sha256")
    .update(`${params.organizationId}:${params.priceListId}:${params.actorId}`)
    .digest("hex")
    .slice(0, 32);
  const phoneNumberId = `${localSimulatorIntegrationPrefix}${integrationKey}`;
  const { data: existingIntegration, error: integrationLookupError } =
    await supabase
      .from("whatsapp_integrations")
      .select("id, status")
      .eq("organization_id", params.organizationId)
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();

  if (integrationLookupError) {
    throw new Error(
      `No se pudo preparar el contexto local: ${integrationLookupError.message}`
    );
  }
  if (existingIntegration && existingIntegration.status !== "DRAFT") {
    throw new Error(
      "El contexto del simulador dejó de estar en borrador; no se modificó"
    );
  }

  const integrationValues = {
    status: "DRAFT",
    display_phone_number: null,
    sales_price_list_id: params.priceListId,
    responsible_user_id: params.actorId,
    business_hours: {},
    commercial_rules: {},
    handoff_message: null,
  };
  const integrationWrite = existingIntegration
    ? supabase
        .from("whatsapp_integrations")
        .update(integrationValues)
        .eq("id", existingIntegration.id)
        .eq("organization_id", params.organizationId)
    : supabase.from("whatsapp_integrations").insert({
        ...integrationValues,
        phone_number_id: phoneNumberId,
        organization_id: params.organizationId,
        created_by: params.actorId,
      });
  const { data: integration, error: integrationError } = await integrationWrite
    .select("id")
    .single();
  if (integrationError || !integration) {
    throw new Error(
      `No se pudo preparar el contexto local: ${integrationError?.message ?? "sin datos"}`
    );
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("whatsapp_conversations")
    .insert({
      organization_id: params.organizationId,
      integration_id: integration.id,
      customer_phone: `${localSimulatorPhonePrefix}${randomUUID()}`,
      customer_id: params.customerId,
      assigned_user_id: params.actorId,
      status: "ACTIVE",
    })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    throw new Error(
      `No se pudo crear la conversación local: ${conversationError?.message ?? "sin datos"}`
    );
  }

  return {
    organizationId: params.organizationId,
    integrationId: integration.id,
    conversationId: conversation.id,
    customerId: params.customerId,
  };
}

export async function verifyLocalSimulatorSession(
  state: SimulationState,
  actorId: string
): Promise<void> {
  await assertWhatsAppEnabled(state.organizationId, "whatsapp_sandbox");
  const supabase = createWhatsAppAdminClient();
  const [
    { data: integration, error: integrationError },
    { data: conversation, error: conversationError },
  ] = await Promise.all([
    supabase
      .from("whatsapp_integrations")
      .select("id, organization_id, phone_number_id, status")
      .eq("id", state.integrationId)
      .eq("organization_id", state.organizationId)
      .maybeSingle(),
    supabase
      .from("whatsapp_conversations")
      .select(
        "id, organization_id, integration_id, customer_id, customer_phone, assigned_user_id"
      )
      .eq("id", state.conversationId)
      .eq("organization_id", state.organizationId)
      .eq("integration_id", state.integrationId)
      .maybeSingle(),
  ]);

  if (
    integrationError ||
    conversationError ||
    !integration ||
    !conversation ||
    integration.status !== "DRAFT" ||
    !isLocalSimulatorIntegration(integration.phone_number_id) ||
    conversation.customer_id !== state.customerId ||
    conversation.assigned_user_id !== actorId ||
    !conversation.customer_phone.startsWith(localSimulatorPhonePrefix)
  ) {
    throw new Error("La sesión de simulación no pertenece a esta organización");
  }
}

export async function recordSimulationMessage(params: {
  state: SimulationState;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
}): Promise<void> {
  const supabase = createWhatsAppAdminClient();
  const { error } = await supabase.from("whatsapp_messages").insert({
    organization_id: params.state.organizationId,
    integration_id: params.state.integrationId,
    conversation_id: params.state.conversationId,
    external_message_id: `local-simulator:${randomUUID()}`,
    direction: params.direction,
    message_type: "TEXT",
    content: params.content,
    delivery_status: params.direction === "INBOUND" ? "RECEIVED" : "FAILED",
    payload: {
      source: "LOCAL_SIMULATOR",
      sentToWhatsApp: false,
    },
  });
  if (error) {
    throw new Error(
      `No se pudo guardar el mensaje de prueba: ${error.message}`
    );
  }

  const { error: conversationError } = await supabase
    .from("whatsapp_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      ...(params.direction === "INBOUND"
        ? {
            status: "ACTIVE",
            handoff_reason: null,
            bot_paused_at: null,
            bot_paused_by: null,
          }
        : {}),
    })
    .eq("id", params.state.conversationId)
    .eq("organization_id", params.state.organizationId)
    .eq("integration_id", params.state.integrationId);
  if (conversationError) {
    throw new Error(
      `No se pudo actualizar la conversación local: ${conversationError.message}`
    );
  }
}

export async function getSimulationMessages(state: SimulationState): Promise<
  Array<{
    direction: "INBOUND" | "OUTBOUND";
    content: string | null;
    created_at: string;
  }>
> {
  const { data, error } = await createWhatsAppAdminClient()
    .from("whatsapp_messages")
    .select("direction, content, created_at")
    .eq("organization_id", state.organizationId)
    .eq("integration_id", state.integrationId)
    .eq("conversation_id", state.conversationId)
    .order("created_at", { ascending: true })
    .limit(24);
  if (error) {
    throw new Error(
      `No se pudo cargar la conversación local: ${error.message}`
    );
  }
  return (data ?? []) as Array<{
    direction: "INBOUND" | "OUTBOUND";
    content: string | null;
    created_at: string;
  }>;
}

export async function getSimulationSnapshot(
  state: SimulationState
): Promise<SimulationSnapshot> {
  const supabase = createWhatsAppAdminClient();
  const [
    { data: conversation, error: conversationError },
    { data: cart, error: cartError },
  ] = await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .select("status, handoff_reason, current_pre_sale_id")
      .eq("id", state.conversationId)
      .eq("organization_id", state.organizationId)
      .eq("integration_id", state.integrationId)
      .maybeSingle(),
    supabase
      .from("conversation_carts")
      .select("id, status")
      .eq("conversation_id", state.conversationId)
      .eq("organization_id", state.organizationId)
      .maybeSingle(),
  ]);
  if (conversationError || cartError || !conversation) {
    throw new Error("No se pudo obtener el estado de la conversación local");
  }

  let cartItemCount = 0;
  if (cart) {
    const { count, error } = await supabase
      .from("conversation_cart_items")
      .select("id", { count: "exact", head: true })
      .eq("cart_id", cart.id)
      .eq("organization_id", state.organizationId);
    if (error) {
      throw new Error(`No se pudo consultar el carrito: ${error.message}`);
    }
    cartItemCount = count ?? 0;
  }

  return {
    cartItemCount,
    cartStatus: cart?.status ?? "EMPTY",
    preSaleCreated: Boolean(conversation.current_pre_sale_id),
    conversationStatus: conversation.status,
    handoffReason: conversation.handoff_reason,
  };
}
