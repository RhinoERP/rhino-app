import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const WHATSAPP_TOOL_PATH = /^\/api\/internal\/whatsapp-agent\/tools\/[^/]+$/;
const CRON_PATH = /^\/api\/cron\/[^/]+$/;

export async function handleRequestProxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isWhatsAppWebhook =
    pathname === "/api/webhooks/whatsapp" &&
    (request.method === "GET" || request.method === "POST");
  const isWhatsAppTool =
    request.method === "POST" && WHATSAPP_TOOL_PATH.test(pathname);
  // Vercel Cron se autentica con CRON_SECRET dentro de cada ruta.
  const isCron = request.method === "GET" && CRON_PATH.test(pathname);

  // These handlers authenticate Meta, the worker or Vercel Cron themselves.
  // None has a browser session, so redirecting them to login breaks them.
  if (isWhatsAppWebhook || isWhatsAppTool || isCron) {
    return NextResponse.next({ request });
  }

  return await updateSession(request);
}
