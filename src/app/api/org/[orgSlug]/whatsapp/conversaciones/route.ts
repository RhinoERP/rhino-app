import { inboxResponse, listInbox } from "@/modules/whatsapp/server/inbox";

export function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  return inboxResponse(async () =>
    listInbox((await params).orgSlug, new URL(request.url).searchParams)
  );
}
