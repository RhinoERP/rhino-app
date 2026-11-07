import type { NextRequest } from "next/server";
import {
  inboxResponse,
  readInboxHistory,
} from "@/modules/whatsapp/server/inbox";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; conversationId: string }> }
) {
  return inboxResponse(async () => {
    const { orgSlug, conversationId } = await params;
    return readInboxHistory(orgSlug, conversationId, request);
  });
}
