import { after, NextResponse } from "next/server";
import {
  findSellerForInbound,
  processSellerMessage,
} from "@/modules/commercial-ai/whatsapp/seller-assistant.service";
import {
  parseMetaWebhook,
  verifyMetaSignature,
} from "@/modules/whatsapp/server/meta-webhook";
import { createWhatsAppAdminClient } from "@/modules/whatsapp/server/supabase-admin";

export const runtime = "nodejs";

export function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const { searchParams } = new URL(request.url);

  if (
    !verifyToken ||
    searchParams.get("hub.mode") !== "subscribe" ||
    searchParams.get("hub.verify_token") !== verifyToken
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const challenge = searchParams.get("hub.challenge");
  return challenge === null
    ? new NextResponse("Bad Request", { status: 400 })
    : new NextResponse(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_META_APP_SECRET;
  const rawBody = await request.text();

  if (
    !(
      appSecret &&
      verifyMetaSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        appSecret
      )
    )
  ) {
    return NextResponse.json(
      { error: "Invalid WhatsApp webhook signature" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid WhatsApp webhook payload" },
      { status: 400 }
    );
  }

  const { messages, deliveryStatuses } = parseMetaWebhook(payload);

  try {
    const supabase = createWhatsAppAdminClient();

    for (const message of messages) {
      // Si escribe un vendedor, lo atiende el asistente de IA Comercial y no
      // entra a la bandeja de pedidos de clientes. Se responde después del 200.
      const seller = await findSellerForInbound(supabase, message);
      if (seller) {
        after(() => processSellerMessage(seller, message));
        continue;
      }
      const { error } = await supabase.rpc("ingest_whatsapp_inbound_message", {
        p_phone_number_id: message.phoneNumberId,
        p_customer_phone: message.customerPhone,
        p_external_message_id: message.externalMessageId,
        p_message_type: message.messageType,
        p_content: message.content,
        p_payload: message.payload,
        p_received_at: message.receivedAt,
      });
      if (error) {
        throw error;
      }
    }

    for (const delivery of deliveryStatuses) {
      const { error } = await supabase.rpc(
        "record_whatsapp_delivery_status_scoped",
        {
          p_phone_number_id: delivery.phoneNumberId,
          p_external_message_id: delivery.externalMessageId,
          p_delivery_status: delivery.status,
          p_status_at: delivery.occurredAt,
        }
      );
      if (error) {
        throw error;
      }
    }
  } catch {
    // Meta debe reintentar ante un error de persistencia. No incluir payload ni
    // credenciales en logs de una ruta que procesa datos de clientes.
    return NextResponse.json(
      { error: "Unable to persist WhatsApp event" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
