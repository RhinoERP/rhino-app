import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const WHATSAPP_TOOL_PATH = /^\/api\/internal\/whatsapp-agent\/tools\/[^/]+$/;

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isWhatsAppWebhook =
    pathname === "/api/webhooks/whatsapp" &&
    (request.method === "GET" || request.method === "POST");
  const isWhatsAppTool =
    request.method === "POST" && WHATSAPP_TOOL_PATH.test(pathname);

  // These handlers authenticate Meta or the worker themselves. Neither caller
  // has a browser session, so redirecting them to login prevents integration.
  if (isWhatsAppWebhook || isWhatsAppTool) {
    return NextResponse.next({ request });
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
