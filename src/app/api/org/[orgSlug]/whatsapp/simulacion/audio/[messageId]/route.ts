import { getAudioMessage } from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";
export const runtime = "nodejs";
export function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; messageId: string }> }
) {
  return audioResponse(async () => {
    const { orgSlug, messageId } = await params;
    const { db: _db, ...result } = await getAudioMessage(orgSlug, messageId);
    return result;
  });
}
