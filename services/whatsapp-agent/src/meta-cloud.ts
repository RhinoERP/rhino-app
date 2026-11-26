import type { SupabaseClient } from "@supabase/supabase-js";
import { AudioError } from "./audio/config.js";

const ARGENTINE_MOBILE_WA_ID = /^549\d{10}$/;
const META_SEND_TIMEOUT_MS = 20_000;
const TYPING_REQUEST_TIMEOUT_MS = 2000;
const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TYPING_SECONDS = 10;
const MAX_TYPING_SECONDS = 25;

export type SendWhatsAppTextInput = {
  integrationId: string;
  conversationId: string;
  phoneNumberId: string;
  recipient: string;
  text: string;
  sourceMessageId?: string;
  orderPrompt?: boolean;
  pricingKey?: string | null;
  jobId?: string;
  leaseToken?: string;
  deliveryLeaseExpiresAt?: string;
};

type DeliveryStatus =
  | "PENDING"
  | "SENT"
  | "UNKNOWN"
  | "CANCELLED"
  | "WINDOW_EXPIRED";
type FinishDelivery = (
  status: DeliveryStatus,
  externalId?: string
) => Promise<void>;
type DispatchGuard = () => Promise<number | undefined>;

type TypingIndicator = {
  messageId: string;
  waitMs: number;
  windowEndsAt: number;
};

function typingWaitMs(): number {
  const value = process.env.WHATSAPP_AGENT_TYPING_SECONDS?.trim();
  const seconds = value ? Number(value) : DEFAULT_TYPING_SECONDS;
  const boundedSeconds =
    Number.isSafeInteger(seconds) && seconds >= 0
      ? Math.min(seconds, MAX_TYPING_SECONDS)
      : DEFAULT_TYPING_SECONDS;
  return boundedSeconds * 1000;
}

async function loadTypingIndicator(
  db: SupabaseClient,
  input: SendWhatsAppTextInput
): Promise<TypingIndicator | null> {
  const waitMs = typingWaitMs();
  if (!waitMs) {
    return null;
  }
  try {
    const inbound = db
      .from("whatsapp_messages")
      .select("external_message_id, sent_at")
      .eq("integration_id", input.integrationId)
      .eq("conversation_id", input.conversationId)
      .eq("direction", "INBOUND")
      .abortSignal(AbortSignal.timeout(TYPING_REQUEST_TIMEOUT_MS));
    // Follow-ups use the latest inbound. Their guard rejects the command if
    // any newer message arrived before dispatch.
    const query = input.sourceMessageId
      ? inbound.eq("id", input.sourceMessageId)
      : inbound.order("sequence_no", { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error || !data?.external_message_id?.startsWith("wamid.")) {
      return null;
    }
    return {
      messageId: data.external_message_id,
      waitMs,
      windowEndsAt: Date.parse(data.sent_at) + CUSTOMER_WINDOW_MS,
    };
  } catch {
    // An unavailable read receipt must not prevent delivery.
    return null;
  }
}

function postMetaMessage(
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function showTypingIndicator(
  endpoint: string,
  token: string,
  messageId: string
): Promise<boolean> {
  try {
    const response = await postMetaMessage(
      endpoint,
      token,
      {
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      },
      TYPING_REQUEST_TIMEOUT_MS
    );
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as { success?: unknown } | null;
    return result?.success === true;
  } catch {
    return false;
  }
}

async function authorizeDelivery(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput
): Promise<void> {
  // Re-check after model/tool execution: superadmin may have disabled the
  // tenant or a human may have paused the conversation in the meantime.
  const { data: integration, error: integrationError } = await supabase
    .from("whatsapp_integrations")
    .select("organization_id, phone_number_id")
    .eq("id", input.integrationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (
    integrationError ||
    !integration ||
    integration.phone_number_id !== input.phoneNumberId ||
    input.phoneNumberId.startsWith("rhinos-local-simulator:")
  ) {
    throw new Error("La integración no está disponible para enviar mensajes");
  }
  const [
    { data: organization, error: organizationError },
    { data: conversation, error: conversationError },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id")
      .eq("id", integration.organization_id)
      .eq("is_active", true)
      .eq("whatsapp_enabled", true)
      .maybeSingle(),
    supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("id", input.conversationId)
      .eq("organization_id", integration.organization_id)
      .eq("integration_id", input.integrationId)
      .eq("customer_phone", input.recipient)
      .in("status", ["ACTIVE", "HANDOFF"])
      .maybeSingle(),
  ]);
  if (
    organizationError ||
    conversationError ||
    !organization ||
    !conversation
  ) {
    throw new Error(
      "El canal está deshabilitado o la conversación fue pausada"
    );
  }
}

async function prepareDelivery(
  db: SupabaseClient,
  input: SendWhatsAppTextInput
) {
  if (!(input.jobId && input.leaseToken && input.sourceMessageId)) {
    throw new Error(
      "El envío requiere un trabajo con lease y outbox persistente."
    );
  }
  const pricingArgs =
    input.pricingKey === undefined ? {} : { p_context_key: input.pricingKey };
  const prepared = await db.rpc(
    input.pricingKey === undefined
      ? "prepare_whatsapp_outbox"
      : "prepare_whatsapp_priced_outbox",
    {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_text: input.text,
      p_order_prompt: input.orderPrompt ?? false,
      ...pricingArgs,
    }
  );
  if (prepared.error || !prepared.data) {
    throw new Error("No se pudo preparar el envío persistente.");
  }
  if (
    prepared.data.conversation_id !== input.conversationId ||
    prepared.data.integration_id !== input.integrationId ||
    prepared.data.source_message_id !== input.sourceMessageId
  ) {
    throw new Error("La reserva no pertenece al mensaje y canal esperados.");
  }
  if (prepared.data.status === "SENT") {
    return {
      text: prepared.data.text as string,
      sentId: prepared.data.external_message_id as string,
    };
  }
  if (prepared.data.status !== "SENDING") {
    throw new AudioError(
      "DELIVERY_REVIEW",
      "El envío requiere revisión o fue reemplazado por un mensaje posterior."
    );
  }
  return {
    text: prepared.data.text as string,
    deliveryLeaseExpiresAt: prepared.data.lease_expires_at as string,
    sentId: undefined as string | undefined,
  };
}

function rejectionStatus(status: number): DeliveryStatus {
  if (status >= 500) {
    return "UNKNOWN";
  }
  if (status === 429) {
    return "PENDING";
  }
  return "CANCELLED";
}

async function checkDispatch(
  input: SendWhatsAppTextInput,
  finish: FinishDelivery,
  guard?: DispatchGuard
): Promise<number> {
  const customerWindowEndsAt = await guard?.();
  const leaseEndsAt = Date.parse(input.deliveryLeaseExpiresAt ?? "");
  if (!(leaseEndsAt > Date.now())) {
    throw new AudioError("DELIVERY_REVIEW", "La reserva de envío venció.");
  }
  if (
    customerWindowEndsAt !== undefined &&
    !(customerWindowEndsAt > Date.now())
  ) {
    await finish("WINDOW_EXPIRED");
    throw new AudioError(
      "WINDOW_EXPIRED",
      "Venció la ventana de 24 horas antes de despachar el mensaje."
    );
  }
  return Math.min(leaseEndsAt, customerWindowEndsAt ?? leaseEndsAt);
}

async function dispatchToMeta(
  input: SendWhatsAppTextInput,
  token: string,
  finish: FinishDelivery,
  { guard, typing }: { guard?: DispatchGuard; typing?: TypingIndicator | null }
): Promise<string> {
  const dispatchDeadline = await checkDispatch(input, finish, guard);
  const recipient = input.recipient;
  const version = process.env.WHATSAPP_META_GRAPH_VERSION ?? "v23.0";
  const endpoint = `https://graph.facebook.com/${version}/${input.phoneNumberId}/messages`;
  if (
    typing &&
    Math.min(dispatchDeadline, typing.windowEndsAt) - Date.now() >
      typing.waitMs + TYPING_REQUEST_TIMEOUT_MS + META_SEND_TIMEOUT_MS
  ) {
    if (await showTypingIndicator(endpoint, token, typing.messageId)) {
      await new Promise<void>((resolve) => setTimeout(resolve, typing.waitMs));
    }
    // A new inbound message, human takeover or eligibility change can supersede
    // this response while the indicator is visible.
    await checkDispatch(input, finish, guard);
  }
  let response: Response;
  try {
    response = await postMetaMessage(
      endpoint,
      token,
      { to: recipient, type: "text", text: { body: input.text } },
      META_SEND_TIMEOUT_MS
    );
  } catch {
    await finish("UNKNOWN");
    throw new AudioError(
      "DELIVERY_UNKNOWN",
      "Meta no confirmó el envío. Revisá la conversación antes de reenviarlo."
    );
  }
  if (!response.ok) {
    const rejection = (await response.json().catch(() => null)) as {
      error?: { code?: number };
    } | null;
    const code = rejection?.error?.code;
    // Meta's test-recipient list can store an Argentine mobile without the 9
    // present in inbound wa_id. Only retry an explicitly rejected send; never
    // change the conversation identity or retry an uncertain delivery.
    if (
      response.status === 400 &&
      code === 131_030 &&
      ARGENTINE_MOBILE_WA_ID.test(recipient)
    ) {
      return dispatchToMeta(
        { ...input, recipient: `54${recipient.slice(3)}` },
        token,
        finish,
        { guard }
      );
    }
    await finish(rejectionStatus(response.status));
    throw new AudioError(
      "DELIVERY_REJECTED",
      `Meta rechazó el mensaje saliente (${response.status}${typeof code === "number" ? `; código ${code}` : ""})`,
      502,
      response.status === 429
    );
  }
  const body = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
  } | null;
  const id = body?.messages?.[0]?.id;
  if (!id || typeof id !== "string") {
    await finish("UNKNOWN");
    throw new AudioError(
      "DELIVERY_UNKNOWN",
      "Meta no devolvió un identificador de mensaje. Revisá la conversación."
    );
  }
  return id;
}

export async function sendWhatsAppText(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput
): Promise<string> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }
  await authorizeDelivery(supabase, input);
  const delivery = await prepareDelivery(supabase, input);
  if (delivery.sentId) {
    return delivery.sentId;
  }
  return deliverPreparedText(
    supabase,
    {
      ...input,
      text: delivery.text,
      deliveryLeaseExpiresAt: delivery.deliveryLeaseExpiresAt,
    },
    token
  );
}

async function deliverPreparedText(
  supabase: SupabaseClient,
  input: SendWhatsAppTextInput,
  token: string,
  command?: {
    id: string;
    guard:
      | "guard_whatsapp_human_dispatch"
      | "guard_whatsapp_follow_up_dispatch";
  }
): Promise<string> {
  const commandId = command?.id;
  const target = commandId
    ? { p_command_id: commandId }
    : { p_source_message_id: input.sourceMessageId };
  const finish: FinishDelivery = async (status, externalId) => {
    // A known Meta ID is retried only here: never repeat the provider POST.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await supabase.rpc(
          commandId ? "complete_whatsapp_command" : "complete_whatsapp_outbox",
          {
            ...target,
            p_lease_token: input.leaseToken,
            p_status: status,
            p_external_message_id: externalId || null,
          }
        );
        if (!result.error && result.data === true) {
          return;
        }
      } catch {
        // Retry persistence, including an acknowledgement lost after commit.
      }
    }
    throw new AudioError(
      "DELIVERY_PERSISTENCE",
      "No se pudo registrar el resultado del envío; requiere revisión."
    );
  };
  const guard =
    commandId || input.pricingKey !== undefined
      ? async () => {
          const { data, error } = await supabase.rpc(
            command?.guard ?? "guard_whatsapp_priced_dispatch",
            {
              ...target,
              p_lease_token: input.leaseToken,
              ...(commandId
                ? {
                    p_phone_number_id: input.phoneNumberId,
                    p_recipient: input.recipient,
                  }
                : {}),
            }
          );
          if (error) {
            // This attempt has not contacted Meta. The existing backoff can retry.
            await finish("PENDING");
            throw new AudioError(
              "DELIVERY_PREFLIGHT",
              "No se pudo autorizar el envío."
            );
          }
          if (data === null) {
            throw new AudioError(
              "DELIVERY_NOT_AUTHORIZED",
              "El envío ya no está autorizado."
            );
          }
          return commandId ? Date.parse(data) : undefined;
        }
      : undefined;
  const typing =
    guard && command?.guard !== "guard_whatsapp_human_dispatch"
      ? await loadTypingIndicator(supabase, input)
      : null;
  const id = await dispatchToMeta(input, token, finish, { guard, typing });
  await finish("SENT", id);
  return id;
}

export type PreparedFollowUp = {
  id: string;
  integration_id: string;
  conversation_id: string;
  phone_number_id: string;
  recipient: string;
  text: string;
  lease_token: string;
  lease_expires_at: string;
};

/** The follow-up RPC has already persisted the text and reserved this command. */
export async function sendPreparedWhatsAppFollowUp(
  db: SupabaseClient,
  command: PreparedFollowUp
): Promise<string> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }
  return await deliverPreparedText(
    db,
    {
      integrationId: command.integration_id,
      conversationId: command.conversation_id,
      phoneNumberId: command.phone_number_id,
      recipient: command.recipient,
      text: command.text,
      leaseToken: command.lease_token,
      deliveryLeaseExpiresAt: command.lease_expires_at,
    },
    token,
    { id: command.id, guard: "guard_whatsapp_follow_up_dispatch" }
  );
}

export async function sendNextWhatsAppHumanMessage(
  db: SupabaseClient
): Promise<boolean> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }
  const { data: command, error: reservationError } = await db.rpc(
    "reserve_whatsapp_human_dispatch"
  );
  if (reservationError) {
    throw new Error("No se pudo reservar un envío humano");
  }
  if (!command) {
    return false;
  }
  const input: SendWhatsAppTextInput = {
    integrationId: command.integration_id,
    conversationId: command.conversation_id,
    phoneNumberId: command.phone_number_id,
    recipient: command.recipient,
    text: command.text,
    leaseToken: command.lease_token,
    deliveryLeaseExpiresAt: command.lease_expires_at,
  };
  try {
    await deliverPreparedText(db, input, token, {
      id: command.id,
      guard: "guard_whatsapp_human_dispatch",
    });
  } catch (error) {
    if (
      !(
        error instanceof AudioError &&
        ["DELIVERY_NOT_AUTHORIZED", "WINDOW_EXPIRED"].includes(error.code)
      )
    ) {
      throw error;
    }
  }
  return true;
}
