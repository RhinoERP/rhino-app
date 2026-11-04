import { NextResponse } from "next/server";
import { sendDailyDigests } from "@/modules/commercial-ai/whatsapp/seller-assistant.service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Resumen del día por WhatsApp para los vendedores (Vercel Cron, lunes a
 * sábado 8:30 hora argentina). Vercel manda `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json(await sendDailyDigests());
}
