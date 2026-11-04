import { type NextRequest, NextResponse } from "next/server";
import { isPublicLegalPath } from "@/lib/legal";
import { updateSession } from "@/lib/supabase/proxy";

const WHATSAPP_TOOL_PATH = /^\/api\/internal\/whatsapp-agent\/tools\/[^/]+$/;

export async function handleRequestProxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    isPublicLegalPath(pathname) &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    return NextResponse.next({ request });
  }

  const isWhatsAppWebhook =
    pathname === "/api/webhooks/whatsapp" &&
    (request.method === "GET" || request.method === "POST");
  const isWhatsAppTool =
    request.method === "POST" && WHATSAPP_TOOL_PATH.test(pathname);
  const isWhatsAppAudioCleanup =
    request.method === "GET" &&
    pathname === "/api/internal/whatsapp-agent/audio-cleanup";

  // These handlers authenticate Meta, the worker or the cron themselves. No caller
  // has a browser session, so redirecting them to login prevents integration.
  if (isWhatsAppWebhook || isWhatsAppTool || isWhatsAppAudioCleanup) {
    return NextResponse.next({ request });
  }

  return await updateSession(request);
}
