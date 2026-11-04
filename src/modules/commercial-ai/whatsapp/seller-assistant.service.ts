import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { isExplicitConfirmation } from "@/modules/whatsapp/server/confirmation";
import type { WhatsAppInboundMessage } from "@/modules/whatsapp/server/meta-webhook";
import { isAiEnabled } from "../service/ai-client";
import {
  type AssistantMessage,
  askAssistant,
} from "../service/assistant.service";
import { getCommercialAiSnapshotForUser } from "../service/commercial-ai.service";
import { AiBudgetExceededError } from "../service/usage.service";
import type { CommercialAiSnapshot } from "../types";
import {
  dayDigest,
  helpText,
  parseQuickCommand,
  pendingText,
  phoneKey,
  routeText,
  toWhatsAppText,
  whatsappRecipient,
} from "./format";
import { isCancel } from "./order-lines";
import {
  SellerAudioError,
  sellerAudioEnabled,
  transcribeSellerAudio,
} from "./seller-audio";
import { confirmDraft, discardDraft, pendingDraft } from "./seller-orders";
import { whatsappChannel } from "./seller-tools";

/** Código y mensaje de error de la API de Meta, sin datos del mensaje. */
async function metaErrorText(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: { code?: number; error_subcode?: number; message?: string };
    };
    const error = json.error;
    return error
      ? `${error.code ?? "?"}/${error.error_subcode ?? "-"} ${error.message ?? ""}`.trim()
      : "sin detalle";
  } catch {
    return "sin detalle";
  }
}

/**
 * Asistente del vendedor por WhatsApp.
 *
 * El webhook de WhatsApp llama a findSellerForInbound antes de pasar el mensaje
 * al agente de pedidos de clientes. Si el número es de un vendedor cargado en
 * IA Comercial, el mensaje se atiende acá: atajos sin IA ("hoy", "ruta",
 * "pendientes") o el asistente con IA, que además puede anotar visitas y
 * recordatorios.
 */

const MAX_WHATSAPP_TEXT = 4000;
const HISTORY_MESSAGES = 10;

export type SellerTarget = {
  organizationId: string;
  userId: string;
  phoneNumberId: string;
  phone: string;
  /** Gerente con "toda la empresa" prendido; si no, ve solo su cartera. */
  teamView?: boolean;
};

/** ¿Este mensaje lo mandó un vendedor de la organización dueña del número? */
export async function findSellerForInbound(
  admin: SupabaseClient,
  message: Pick<WhatsAppInboundMessage, "phoneNumberId" | "customerPhone">
): Promise<SellerTarget | null> {
  const { data: integration } = await admin
    .from("whatsapp_integrations")
    .select("organization_id")
    .eq("phone_number_id", message.phoneNumberId)
    .maybeSingle();
  if (!integration) {
    return null;
  }
  const { data: seller } = await admin
    .from("commercial_ai_seller_phones")
    .select("user_id, team_view")
    .eq("organization_id", integration.organization_id)
    .eq("phone_key", phoneKey(message.customerPhone))
    .maybeSingle();
  if (!seller) {
    return null;
  }
  return {
    organizationId: integration.organization_id as string,
    userId: seller.user_id as string,
    phoneNumberId: message.phoneNumberId,
    phone: message.customerPhone,
    teamView: seller.team_view === true,
  };
}

/** Manda texto por la API de WhatsApp Cloud y lo guarda en el historial. */
export async function sendSellerText(
  target: SellerTarget,
  body: string
): Promise<void> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta WHATSAPP_META_ACCESS_TOKEN");
  }
  const version = process.env.WHATSAPP_META_GRAPH_VERSION ?? "v23.0";
  const text = body.slice(0, MAX_WHATSAPP_TEXT);
  const response = await fetch(
    `https://graph.facebook.com/${version}/${target.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: whatsappRecipient(target.phone),
        type: "text",
        text: { body: text, preview_url: false },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Meta rechazó el mensaje (${response.status}): ${await metaErrorText(response)}`
    );
  }
  const json = (await response.json()) as { messages?: { id?: string }[] };
  await createAdminClient()
    .from("commercial_ai_whatsapp_messages")
    .insert({
      organization_id: target.organizationId,
      user_id: target.userId,
      direction: "out",
      external_message_id: json.messages?.[0]?.id ?? null,
      body: text,
    });
}

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Plantilla aprobada en Meta para escribirle primero al vendedor (fuera de las
 * 24 h desde su último mensaje). Debe tener un parámetro {{1}} con el nombre y
 * un botón de respuesta rápida "Ver mi día".
 */
async function sendDigestTemplate(
  target: SellerTarget,
  firstName: string
): Promise<boolean> {
  const template = process.env.WHATSAPP_SELLER_DIGEST_TEMPLATE;
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!(template && token)) {
    return false;
  }
  const version = process.env.WHATSAPP_META_GRAPH_VERSION ?? "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${target.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: whatsappRecipient(target.phone),
        type: "template",
        template: {
          name: template,
          language: {
            code: process.env.WHATSAPP_SELLER_DIGEST_LANGUAGE ?? "es_AR",
          },
          components: [
            { type: "body", parameters: [{ type: "text", text: firstName }] },
          ],
        },
      }),
    }
  );
  return response.ok;
}

export type DigestRunResult = {
  sellers: number;
  sentText: number;
  sentTemplate: number;
  skipped: number;
  failed: number;
};

/**
 * Resumen del día para todos los vendedores con WhatsApp cargado. Si el
 * vendedor escribió en las últimas 24 h se manda el resumen completo; si no,
 * la plantilla con el botón "Ver mi día" (Meta no deja mandar texto libre).
 */
export async function sendDailyDigests(): Promise<DigestRunResult> {
  const admin = createAdminClient();
  const result: DigestRunResult = {
    sellers: 0,
    sentText: 0,
    sentTemplate: 0,
    skipped: 0,
    failed: 0,
  };
  const { data: sellers } = await admin
    .from("commercial_ai_seller_phones")
    .select("organization_id, user_id, phone")
    .eq("daily_digest", true);
  const { data: integrations } = await admin
    .from("whatsapp_integrations")
    .select("organization_id, phone_number_id");
  const numberByOrg = new Map(
    (integrations ?? []).map((i) => [i.organization_id, i.phone_number_id])
  );

  for (const seller of sellers ?? []) {
    result.sellers += 1;
    const phoneNumberId = numberByOrg.get(seller.organization_id);
    if (!phoneNumberId) {
      result.skipped += 1;
      continue;
    }
    const target: SellerTarget = {
      organizationId: seller.organization_id,
      userId: seller.user_id,
      phoneNumberId,
      phone: seller.phone,
    };
    try {
      // El resumen diario es personal: siempre la cartera propia.
      const snapshot = await getCommercialAiSnapshotForUser(
        target.organizationId,
        target.userId,
        { ownPortfolioOnly: true }
      );
      if (!snapshot) {
        result.skipped += 1;
        continue;
      }
      const { data: last } = await admin
        .from("commercial_ai_whatsapp_messages")
        .select("created_at")
        .eq("organization_id", target.organizationId)
        .eq("user_id", target.userId)
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const inWindow =
        last &&
        Date.now() - new Date(last.created_at as string).getTime() <
          SESSION_WINDOW_MS;
      if (inWindow) {
        await sendSellerText(target, dayDigest(snapshot));
        result.sentText += 1;
      } else if (
        await sendDigestTemplate(
          target,
          snapshot.currentUserName.split(" ")[0] ?? ""
        )
      ) {
        result.sentTemplate += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      console.error("IA Comercial WhatsApp: falló el resumen diario", error);
      result.failed += 1;
    }
  }
  return result;
}

/** Texto del mensaje, incluidos los botones de plantillas ("Ver mi día"). */
function inboundText(message: WhatsAppInboundMessage): string | null {
  if (message.content) {
    return message.content;
  }
  const button = (message.payload as { button?: { text?: unknown } }).button;
  return typeof button?.text === "string" ? button.text : null;
}

async function history(
  target: SellerTarget,
  admin: SupabaseClient
): Promise<AssistantMessage[]> {
  const { data } = await admin
    .from("commercial_ai_whatsapp_messages")
    .select("direction, body")
    .eq("organization_id", target.organizationId)
    .eq("user_id", target.userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  return (data ?? [])
    .reverse()
    .filter((row) => row.body)
    .map((row) => ({
      role: row.direction === "in" ? "user" : "assistant",
      content: row.body as string,
    }));
}

async function reply(
  snapshot: CommercialAiSnapshot,
  target: SellerTarget,
  text: string,
  admin: SupabaseClient
): Promise<string> {
  // Un pedido armado espera el "sí": se carga sin pasar por la IA.
  if (isExplicitConfirmation(text) || isCancel(text)) {
    const draft = await pendingDraft(snapshot);
    if (draft) {
      if (isCancel(text)) {
        await discardDraft(snapshot);
        return "Listo, no lo cargo. 👍";
      }
      return confirmDraft(snapshot, draft);
    }
  }

  const command = parseQuickCommand(text);
  const firstName = snapshot.currentUserName.split(" ")[0] ?? "";
  switch (command) {
    case "dia":
      return dayDigest(snapshot);
    case "ruta":
      return routeText(snapshot);
    case "pendientes":
      return pendingText(snapshot);
    case "ayuda":
      return helpText(firstName);
    default:
      break;
  }
  if (!isAiEnabled()) {
    return `${helpText(firstName)}\n\n(La IA no está activa: por ahora solo entiendo esos atajos.)`;
  }
  const answer = await askAssistant(
    snapshot,
    await history(target, admin),
    whatsappChannel(snapshot)
  );
  return toWhatsAppText(answer);
}

/** Atiende un mensaje de un vendedor. Pensado para correr después de responder a Meta. */
const HEARD_PREVIEW = 160;

async function resolveText(
  admin: SupabaseClient,
  target: SellerTarget,
  message: WhatsAppInboundMessage,
  inboundId: string
): Promise<{ text: string; heard: string | null } | { notice: string }> {
  const text = inboundText(message);
  if (text) {
    return { text, heard: null };
  }
  if (message.messageType !== "AUDIO") {
    return {
      notice:
        "Por ahora entiendo texto y audios. Escribime *ayuda* para ver qué puedo hacer.",
    };
  }
  if (!(await sellerAudioEnabled(admin, target.organizationId))) {
    return {
      notice:
        "Los audios no están activados para tu empresa. Mandámelo escrito y lo anoto.",
    };
  }
  try {
    const heard = await transcribeSellerAudio(
      message.payload,
      target.phoneNumberId
    );
    // El historial guarda lo que dijo, para que la IA tenga el contexto.
    await admin
      .from("commercial_ai_whatsapp_messages")
      .update({ body: heard })
      .eq("id", inboundId);
    return { text: heard, heard };
  } catch (error) {
    if (error instanceof SellerAudioError) {
      return { notice: error.message };
    }
    throw error;
  }
}

/** Atiende un mensaje de un vendedor. Pensado para correr después de responder a Meta. */
export async function processSellerMessage(
  target: SellerTarget,
  message: WhatsAppInboundMessage
): Promise<void> {
  const admin = createAdminClient();

  // Meta reintenta: si ya guardamos este mensaje, no se procesa de nuevo.
  const { data: inbound, error: insertError } = await admin
    .from("commercial_ai_whatsapp_messages")
    .insert({
      organization_id: target.organizationId,
      user_id: target.userId,
      direction: "in",
      external_message_id: message.externalMessageId,
      message_type: message.messageType,
      body: inboundText(message) ?? "",
    })
    .select("id")
    .single();
  if (insertError || !inbound) {
    return;
  }

  try {
    const input = await resolveText(
      admin,
      target,
      message,
      inbound.id as string
    );
    if ("notice" in input) {
      await sendSellerText(target, input.notice);
      return;
    }
    const snapshot = await getCommercialAiSnapshotForUser(
      target.organizationId,
      target.userId,
      { ownPortfolioOnly: !target.teamView }
    );
    if (!snapshot) {
      await sendSellerText(
        target,
        "Tu usuario no tiene acceso a IA Comercial. Pedíselo al gerente."
      );
      return;
    }
    const answer = await reply(snapshot, target, input.text, admin);
    const heard = input.heard
      ? `🎧 _Entendí:_ "${input.heard.length > HEARD_PREVIEW ? `${input.heard.slice(0, HEARD_PREVIEW)}…` : input.heard}"\n\n`
      : "";
    await sendSellerText(target, `${heard}${answer}`);
  } catch (error) {
    console.error("IA Comercial WhatsApp: no se pudo responder", error);
    const reason =
      error instanceof AiBudgetExceededError
        ? error.message
        : "Tuve un problema para responderte. Probá de nuevo en un rato.";
    await sendSellerText(target, reason).catch((sendError: unknown) => {
      console.error("IA Comercial WhatsApp: tampoco se pudo avisar", sendError);
    });
  }
}
