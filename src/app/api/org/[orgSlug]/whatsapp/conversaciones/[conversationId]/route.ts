import type { NextRequest } from "next/server";
import {
  inboxResponse,
  markInboxChatRead,
  readInboxChat,
} from "@/modules/whatsapp/server/inbox";

type Context = { params: Promise<{ orgSlug: string; conversationId: string }> };

export function GET(request: NextRequest, { params }: Context) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId } = await params;
    return readInboxChat(orgSlug, conversationId, request);
  });
}

export function POST(request: NextRequest, { params }: Context) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId } = await params;
    return markInboxChatRead(orgSlug, conversationId, request);
  });
}
