import {
  inboxResponse,
  markInboxChatRead,
  readInboxChat,
} from "@/modules/whatsapp/server/inbox";

type Context = { params: Promise<{ orgSlug: string; conversationId: string }> };

export function GET(_request: Request, { params }: Context) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId } = await params;
    return readInboxChat(orgSlug, conversationId);
  });
}

export function POST(request: Request, { params }: Context) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId } = await params;
    return markInboxChatRead(orgSlug, conversationId, request);
  });
}
