import { completeAudioUpload } from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";
export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; uploadId: string }> }
) {
  return audioResponse(async () => {
    const { orgSlug, uploadId } = await params;
    return completeAudioUpload(orgSlug, uploadId);
  });
}
