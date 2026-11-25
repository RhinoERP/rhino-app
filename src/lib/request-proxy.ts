import { type NextRequest, NextResponse } from "next/server";
import { isPublicLegalPath } from "@/lib/legal";
import { updateSession } from "@/lib/supabase/proxy";

const WHATSAPP_TOOL_PATH = /^\/api\/internal\/whatsapp-agent\/tools\/[^/]+$/;
const REMITTANCE_RECEIPT_PATH =
  /^\/remitos\/recepcion\/[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/;

export async function handleRequestProxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    REMITTANCE_RECEIPT_PATH.test(pathname) &&
    ["GET", "HEAD", "POST"].includes(request.method)
  ) {
    const response = NextResponse.next({ request });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
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
