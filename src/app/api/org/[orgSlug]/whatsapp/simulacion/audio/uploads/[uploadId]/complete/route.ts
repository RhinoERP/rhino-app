import type { NextRequest } from "next/server";
import { completeAudioUpload } from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";
export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; uploadId: string }> }
) {
  return audioResponse(async () => {
    const { orgSlug, uploadId } = await params;
    return completeAudioUpload(orgSlug, uploadId, request);
  });
}
