import {
  inboxResponse,
  readInboxHistory,
} from "@/modules/whatsapp/server/inbox";

export function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string; conversationId: string }> }
) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId } = await params;
    return readInboxHistory(
      orgSlug,
      conversationId,
      new URL(request.url).searchParams
    );
  });
}
