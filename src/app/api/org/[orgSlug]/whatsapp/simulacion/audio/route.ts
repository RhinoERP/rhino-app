import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  audioCapabilities,
  audioContext,
} from "@/modules/whatsapp/server/audio";
import { audioResponse } from "@/modules/whatsapp/server/audio-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ orgSlug: string }> };
export function GET(request: NextRequest, { params }: Context) {
  return audioResponse(async () => {
    const { organization } = await audioContext(
      (await params).orgSlug,
      request
    );
    return audioCapabilities(organization.id);
  });
}
export function PATCH(request: NextRequest, { params }: Context) {
  return audioResponse(async () => {
    const { orgSlug } = await params;
    const input = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await request.json());
    const { organization, db } = await audioContext(orgSlug, request, true);
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
