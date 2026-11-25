import type { NextRequest } from "next/server";
import { reserveAudioUpload } from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";
export const runtime = "nodejs";
export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  return audioResponse(async () =>
    reserveAudioUpload(
      (await params).orgSlug,
      await request.json().catch(() => null),
      request
    )
  );
}
