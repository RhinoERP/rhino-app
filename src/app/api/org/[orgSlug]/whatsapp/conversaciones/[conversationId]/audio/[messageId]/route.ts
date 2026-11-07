import type { NextRequest } from "next/server";
import { inboxResponse, playInboxAudio } from "@/modules/whatsapp/server/inbox";

export function GET(
  request: NextRequest,
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
    return playInboxAudio(orgSlug, conversationId, messageId, request);
  });
}
