import { createHmac, timingSafeEqual } from "node:crypto";

const HEX_SIGNATURE = /^[a-f0-9]+$/i;

export type WhatsAppInboundMessage = {
  phoneNumberId: string;
  customerPhone: string;
  externalMessageId: string;
  messageType:
    | "TEXT"
    | "IMAGE"
    | "DOCUMENT"
    | "AUDIO"
    | "VIDEO"
    | "INTERACTIVE"
    | "SYSTEM";
  content: string | null;
  payload: Record<string, unknown>;
  receivedAt: string;
};

export type WhatsAppDeliveryStatus = {
  externalMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  occurredAt: string;
  payload: Record<string, unknown>;
};

type MetaWebhookValue = {
  metadata?: { phone_number_id?: unknown };
  messages?: unknown;
  statuses?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metaTimestampToIso(timestamp: unknown): string {
  const seconds =
    typeof timestamp === "string" ? Number(timestamp) : Number.NaN;
  return Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function messageType(type: unknown): WhatsAppInboundMessage["messageType"] {
  switch (type) {
    case "text":
      return "TEXT";
    case "image":
      return "IMAGE";
    case "document":
      return "DOCUMENT";
    case "audio":
      return "AUDIO";
    case "video":
      return "VIDEO";
    case "interactive":
    case "button":
      return "INTERACTIVE";
    default:
      return "SYSTEM";
  }
}

function messageContent(message: Record<string, unknown>): string | null {
  const text = message.text;
  if (isRecord(text) && typeof text.body === "string") {
    return text.body;
  }

  const interactive = message.interactive;
  if (isRecord(interactive)) {
    const buttonReply = interactive.button_reply;
    const listReply = interactive.list_reply;
    if (isRecord(buttonReply) && typeof buttonReply.title === "string") {
      return buttonReply.title;
    }
    if (isRecord(listReply) && typeof listReply.title === "string") {
      return listReply.title;
    }
  }

  return null;
}

function toPayload(value: Record<string, unknown>): Record<string, unknown> {
  // El payload se usa para auditoría y tipos no textuales; nunca se registra
  // el body HTTP completo ni cabeceras que puedan contener credenciales.
  return value;
}

function parseInboundMessages(
  candidates: unknown,
  phoneNumberId: string
): WhatsAppInboundMessage[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.from !== "string"
    ) {
      return [];
    }

    return [
      {
        phoneNumberId,
        customerPhone: candidate.from,
        externalMessageId: candidate.id,
        messageType: messageType(candidate.type),
        content: messageContent(candidate),
        payload: toPayload(candidate),
        receivedAt: metaTimestampToIso(candidate.timestamp),
      },
    ];
  });
}

function parseDeliveryStatuses(candidates: unknown): WhatsAppDeliveryStatus[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string") {
      return [];
    }
    const status =
      typeof candidate.status === "string"
        ? candidate.status.toUpperCase()
        : undefined;
    if (
      status !== "SENT" &&
      status !== "DELIVERED" &&
      status !== "READ" &&
      status !== "FAILED"
    ) {
      return [];
    }
    return [
      {
        externalMessageId: candidate.id,
        status,
        occurredAt: metaTimestampToIso(candidate.timestamp),
        payload: toPayload(candidate),
      },
    ];
  });
}

function parseChange(change: unknown): {
  messages: WhatsAppInboundMessage[];
  deliveryStatuses: WhatsAppDeliveryStatus[];
} {
  if (
    !isRecord(change) ||
    change.field !== "messages" ||
    !isRecord(change.value)
  ) {
    return { messages: [], deliveryStatuses: [] };
  }

  const value = change.value as MetaWebhookValue;
  const phoneNumberId = value.metadata?.phone_number_id;
  if (typeof phoneNumberId !== "string" || phoneNumberId.length === 0) {
    return { messages: [], deliveryStatuses: [] };
  }

  return {
    messages: parseInboundMessages(value.messages, phoneNumberId),
    deliveryStatuses: parseDeliveryStatuses(value.statuses),
  };
}

export function parseMetaWebhook(payload: unknown): {
  messages: WhatsAppInboundMessage[];
  deliveryStatuses: WhatsAppDeliveryStatus[];
} {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") {
    return { messages: [], deliveryStatuses: [] };
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const changes = entries.flatMap((entry) =>
    isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : []
  );
  const parsedChanges = changes.map(parseChange);

  return {
    messages: parsedChanges.flatMap((change) => change.messages),
    deliveryStatuses: parsedChanges.flatMap(
      (change) => change.deliveryStatuses
    ),
  };
}

export function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature?.startsWith("sha256=") || appSecret.length === 0) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const received = signature.slice("sha256=".length);
  if (received.length !== expected.length || !HEX_SIGNATURE.test(received)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(received, "hex"),
    Buffer.from(expected, "hex")
  );
}
