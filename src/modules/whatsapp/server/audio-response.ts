import { NextResponse } from "next/server";
import { z } from "zod";
import { AudioError } from "../../../../services/whatsapp-agent/src/audio/config";

import { WhatsAppControlAccessError } from "./conversation-control";

export async function audioResponse(
  work: () => Promise<unknown>
): Promise<Response> {
  try {
    return NextResponse.json(await work(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof WhatsAppControlAccessError) {
      return NextResponse.json(
        { error: "No tenés acceso al audio de este simulador." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Los datos del audio no son válidos.",
          code: "AUDIO_INPUT",
          retryable: false,
        },
        { status: 400 }
      );
    }
    if (error instanceof AudioError) {
      return NextResponse.json(
        { error: error.message, code: error.code, retryable: error.retryable },
        { status: error.status }
      );
    }
    console.error("[whatsapp-audio] operación fallida", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      {
        error:
          "No se pudo procesar el audio. Revisá la configuración o volvé a intentar.",
        code: "AUDIO_INTERNAL",
        retryable: true,
      },
      { status: 500 }
    );
  }
}
