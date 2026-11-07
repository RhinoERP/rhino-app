import type { NextRequest } from "next/server";
import { inboxResponse, listInbox } from "@/modules/whatsapp/server/inbox";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  return inboxResponse(async () => listInbox((await params).orgSlug, request));
}
