import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  inboxCursorSchema,
  inboxDetailSchema,
  inboxFilterSchema,
  inboxHistorySchema,
  inboxListSchema,
} from "../inbox-contract";
import {
  getWhatsAppUserAccess,
  WhatsAppControlAccessError,
} from "./conversation-control";
import { createWhatsAppAdminClient } from "./supabase-admin";

const LIST_SIZE = 30;
const HISTORY_SIZE = 50;
const privateHeaders = { "Cache-Control": "private, no-store" };
const audioMime = z.enum([
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
]);

export const inboxJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: privateHeaders });

class InboxUnavailable extends Error {}

export async function inboxResponse(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return inboxJson({ error: "La solicitud no es válida." }, 400);
    }
    if (
      error instanceof WhatsAppControlAccessError ||
      error instanceof InboxUnavailable
    ) {
      return inboxJson(
        { error: "WhatsApp o esta conversación ya no están disponibles." },
        403
      );
    }
    return inboxJson(
      { error: "No se pudo consultar WhatsApp. Volvé a intentar." },
      503
    );
  }
}

async function inboxScope(orgSlug: string, request: NextRequest) {
  const { organization, userId } = await getWhatsAppUserAccess(
    orgSlug,
    "whatsapp.read",
    request
  );
  return {
    db: createWhatsAppAdminClient(),
    args: { p_org: organization.id, p_actor: userId },
  };
}

function rpcData(result: { error: { code?: string } | null; data: unknown }) {
  if (result.error?.code === "42501") {
    throw new InboxUnavailable();
  }
  if (result.error) {
    throw new Error("Error de consulta de bandeja");
  }
  return result.data;
}

function cursor(params: URLSearchParams) {
  if (!(params.has("at") || params.has("id"))) {
    return { p_at: null, p_id: null };
  }
  const parsed = inboxCursorSchema.parse({
    at: params.get("at"),
    id: params.get("id"),
  });
  return { p_at: parsed.at, p_id: parsed.id };
}

export async function listInbox(orgSlug: string, request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filter = inboxFilterSchema.parse(params.get("filter") ?? "all");
  const search = z
    .string()
    .trim()
    .max(100)
    .parse(params.get("q") ?? "");
  const page = cursor(params);
  const { db, args } = await inboxScope(orgSlug, request);
  const raw = rpcData(
    await db.rpc("list_whatsapp_inbox", {
      ...args,
      ...page,
      p_filter: filter,
      p_search: search,
    })
  );
  const result = inboxListSchema.safeParse(raw);
  if (!result.success) {
    throw new Error("Contrato de listado inválido");
  }
  const rows = result.data.rows.slice(0, LIST_SIZE);
  const last = rows.at(-1);
  return inboxJson({
    attentionCount: result.data.attentionCount,
    rows,
    next:
      last && result.data.rows.length > LIST_SIZE
        ? { id: last.id, at: last.at }
        : null,
  });
}

export async function readInboxChat(
  orgSlug: string,
  conversationId: string,
  request: NextRequest
) {
  const chat = z.uuid().parse(conversationId);
  const { db, args } = await inboxScope(orgSlug, request);
  const result = inboxDetailSchema.safeParse(
    rpcData(
      await db.rpc("get_whatsapp_inbox_detail", { ...args, p_chat: chat })
    )
  );
  if (!result.success) {
    throw new Error("Contrato de conversación inválido");
  }
  return inboxJson(result.data);
}

export async function readInboxHistory(
  orgSlug: string,
  conversationId: string,
  request: NextRequest
) {
  const params = request.nextUrl.searchParams;
  const chat = z.uuid().parse(conversationId);
  const page = cursor(params);
  const after =
    z.enum(["before", "after"]).parse(params.get("direction") ?? "before") ===
    "after";
  if (after && page.p_at === null) {
    return inboxJson({ error: "Falta el cursor de sincronización." }, 400);
  }
  const { db, args } = await inboxScope(orgSlug, request);
  const result = inboxHistorySchema.safeParse(
    rpcData(
      await db.rpc("get_whatsapp_inbox_history", {
        ...args,
        ...page,
        p_chat: chat,
        p_after: after,
      })
    )
  );
  if (!result.success) {
    throw new Error("Contrato de historial inválido");
  }
  const rows = result.data.slice(0, HISTORY_SIZE);
  return inboxJson({
    rows: after ? rows : rows.reverse(),
    more: result.data.length > HISTORY_SIZE,
  });
}

export async function markInboxChatRead(
  orgSlug: string,
  conversationId: string,
  request: NextRequest
) {
  const chat = z.uuid().parse(conversationId);
  const { messageId } = z
    .object({ messageId: z.uuid() })
    .parse(await request.json().catch(() => null));
  const { db, args } = await inboxScope(orgSlug, request);
  rpcData(
    await db.rpc("mark_whatsapp_inbox_read", {
      ...args,
      p_chat: chat,
      p_message: messageId,
    })
  );
  return new Response(null, { status: 204, headers: privateHeaders });
}

export async function playInboxAudio(
  orgSlug: string,
  conversationId: string,
  messageId: string,
  request: NextRequest
) {
  const chat = z.uuid().parse(conversationId);
  const message = z.uuid().parse(messageId);
  const { db, args } = await inboxScope(orgSlug, request);
  const result = z
    .object({ path: z.string().min(1), mime: z.string().nullable() })
    .safeParse(
      rpcData(
        await db.rpc("get_whatsapp_inbox_audio", {
          ...args,
          p_chat: chat,
          p_message: message,
        })
      )
    );
  if (!result.success) {
    return inboxJson({ error: "El audio ya no está disponible." }, 404);
  }
  const { data, error } = await db.storage
    .from("whatsapp-audio")
    .download(result.data.path);
  if (error || !data) {
    return inboxJson({ error: "El audio ya no está disponible." }, 404);
  }
  const mime = audioMime.safeParse(
    result.data.mime?.split(";")[0] || data.type.split(";")[0]
  );
  return new Response(data, {
    headers: {
      ...privateHeaders,
      "Content-Type": mime.success ? mime.data : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
