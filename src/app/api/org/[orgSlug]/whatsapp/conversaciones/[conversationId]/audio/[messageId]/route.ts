import { inboxResponse, playInboxAudio } from "@/modules/whatsapp/server/inbox";

export function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      orgSlug: string;
      conversationId: string;
      messageId: string;
    }>;
  }
) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId, messageId } = await params;
    return playInboxAudio(orgSlug, conversationId, messageId);
  });
}
