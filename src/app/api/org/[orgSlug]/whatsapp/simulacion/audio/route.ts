import { z } from "zod";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  audioCapabilities,
  audioContext,
} from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ orgSlug: string }> };
export function GET(_request: Request, { params }: Context) {
  return audioResponse(async () => {
    const { organization } = await audioContext((await params).orgSlug);
    return audioCapabilities(organization.id);
  });
}
export function PATCH(request: Request, { params }: Context) {
  return audioResponse(async () => {
    const { orgSlug } = await params;
    await ensure("whatsapp.configure", orgSlug, "whatsapp_sandbox");
    const input = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await request.json());
    const { organization, db } = await audioContext(orgSlug);
    const { error } = await db
      .from("organizations")
      .update({ whatsapp_sandbox_audio_enabled: input.enabled })
      .eq("id", organization.id);
    if (error) {
      throw new Error("No se pudo guardar la habilitación de audio.");
    }
    return audioCapabilities(organization.id);
  });
}
