import type { NextRequest } from "next/server";
import { getAudioMessage } from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";
export const runtime = "nodejs";
export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; messageId: string }> }
) {
  return audioResponse(async () => {
    const { orgSlug, messageId } = await params;
    return getAudioMessage(orgSlug, messageId, request);
  });
}
