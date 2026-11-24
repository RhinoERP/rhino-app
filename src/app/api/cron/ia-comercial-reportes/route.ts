import { NextResponse } from "next/server";
import { runDueReportSchedules } from "@/modules/commercial-ai/reports/report-delivery.service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Reportes programados por WhatsApp (Vercel Cron, cada hora). Manda los que
 * tocan en esta hora argentina. Vercel manda `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json(await runDueReportSchedules());
}
