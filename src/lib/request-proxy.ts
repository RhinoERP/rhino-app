import { type NextRequest, NextResponse } from "next/server";
import { isPublicLegalPath } from "@/lib/legal";
import { updateSession } from "@/lib/supabase/proxy";

const WHATSAPP_TOOL_PATH = /^\/api\/internal\/whatsapp-agent\/tools\/[^/]+$/;
const CRON_PATH = /^\/api\/cron\/[^/]+$/;

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
  // Mercado Pago: la ruta verifica la firma y consulta cada pago a la API.
  const isMercadoPagoWebhook =
    request.method === "POST" && pathname === "/api/webhooks/mercadopago";
  // Vercel Cron se autentica con CRON_SECRET dentro de cada ruta.
  const isCron = request.method === "GET" && CRON_PATH.test(pathname);

  // These handlers authenticate Meta, the worker or the cron themselves. No caller
  // has a browser session, so redirecting them to login prevents integration.
  if (
    isWhatsAppWebhook ||
    isWhatsAppTool ||
    isWhatsAppAudioCleanup ||
    isCron ||
    isMercadoPagoWebhook
  ) {
    return NextResponse.next({ request });
  }

  return await updateSession(request);
}
