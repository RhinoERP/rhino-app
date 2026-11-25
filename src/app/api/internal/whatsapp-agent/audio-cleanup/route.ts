import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createWhatsAppAdminClient } from "@/modules/whatsapp/server/supabase-admin";
import { cleanupAudioFiles } from "../../../../../../services/whatsapp-agent/src/audio/cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const received = request.headers.get("authorization")?.replace("Bearer ", "");
  const expectedBytes = Buffer.from(expected || "");
  const receivedBytes = Buffer.from(received || "");
  if (
    !(expected && received) ||
    expectedBytes.length !== receivedBytes.length ||
    !timingSafeEqual(expectedBytes, receivedBytes)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(
      await cleanupAudioFiles(createWhatsAppAdminClient())
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la limpieza de audios." },
      { status: 503 }
    );
  }
}
