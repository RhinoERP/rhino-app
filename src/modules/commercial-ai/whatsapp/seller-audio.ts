import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notas de voz del vendedor: se bajan de Meta y se transcriben con el mismo
 * proveedor y las mismas reglas que el agente de pedidos
 * (services/whatsapp-agent/src/audio): OpenAI, español, hasta 4 MB, y solo si
 * la empresa tiene los audios de WhatsApp habilitados.
 *
 * Al vendedor se le responde enseguida, así que se transcribe en el momento
 * (sin cola) y el audio no se guarda: solo queda el texto en el historial.
 */

const MAX_BYTES = 4_000_000;
const MAX_TEXT = 12_000;
const MEDIA_ID = /^[0-9]+$/;
const GRAPH_VERSION = /^v\d+\.\d+$/;
const MEDIA_DOMAINS = [
  ".facebook.com",
  ".fbsbx.com",
  ".fbcdn.net",
  ".whatsapp.net",
];
const EXTENSIONS: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/amr": "amr",
  "audio/webm": "webm",
  "audio/wav": "wav",
};

/** Error con un mensaje que se le puede mostrar al vendedor tal cual. */
export class SellerAudioError extends Error {}

export async function sellerAudioEnabled(
  admin: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  if (
    process.env.WHATSAPP_AUDIO_ENABLED !== "true" ||
    !process.env.OPENAI_API_KEY?.trim()
  ) {
    return false;
  }
  const { data } = await admin
    .from("organizations")
    .select("whatsapp_audio_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.whatsapp_audio_enabled === true;
}

function audioRef(payload: Record<string, unknown>): {
  mediaId: string;
  mimeType: string;
} {
  const audio = payload.audio as { id?: unknown; mime_type?: unknown } | null;
  const mediaId = typeof audio?.id === "string" ? audio.id : "";
  if (!MEDIA_ID.test(mediaId)) {
    throw new SellerAudioError("No me llegó bien el audio. ¿Me lo reenviás?");
  }
  const mimeType =
    typeof audio?.mime_type === "string"
      ? (audio.mime_type.split(";")[0]?.trim() ?? "audio/ogg")
      : "audio/ogg";
  return { mediaId, mimeType };
}

async function readLimited(response: Response): Promise<Uint8Array> {
  if (!(response.ok && response.body)) {
    throw new SellerAudioError("No pude bajar el audio. ¿Me lo reenviás?");
  }
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body.cancel();
    throw new SellerAudioError(
      "El audio es muy largo. Mandame uno de hasta 2 minutos."
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    size += next.value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new SellerAudioError(
        "El audio es muy largo. Mandame uno de hasta 2 minutos."
      );
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function downloadFromMeta(
  mediaId: string,
  phoneNumberId: string
): Promise<Uint8Array> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_META_GRAPH_VERSION || "v23.0";
  if (!(token && GRAPH_VERSION.test(version))) {
    throw new Error("Falta configurar WhatsApp (token o versión de Meta).");
  }
  const meta = await fetch(
    `https://graph.facebook.com/${version}/${mediaId}?phone_number_id=${encodeURIComponent(phoneNumberId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    }
  );
  if (!meta.ok) {
    throw new SellerAudioError("No pude bajar el audio. ¿Me lo reenviás?");
  }
  const { url: rawUrl } = (await meta.json()) as { url?: string };
  const url = new URL(rawUrl || "invalid:");
  if (
    url.protocol !== "https:" ||
    url.port ||
    !MEDIA_DOMAINS.some((domain) => url.hostname.endsWith(domain))
  ) {
    throw new Error("Meta devolvió una dirección de audio inválida.");
  }
  return readLimited(
    await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    })
  );
}

/** Baja la nota de voz y devuelve el texto (y su tamaño, para cobrar los minutos). */
export async function transcribeSellerAudio(
  payload: Record<string, unknown>,
  phoneNumberId: string
): Promise<{ text: string; bytes: number }> {
  const { mediaId, mimeType } = audioRef(payload);
  const bytes = await downloadFromMeta(mediaId, phoneNumberId);
  const model =
    process.env.WHATSAPP_AGENT_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe";
  const form = new FormData();
  form.set("model", model);
  form.set(
    "file",
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    `audio.${EXTENSIONS[mimeType] ?? "ogg"}`
  );
  form.set(model === "gpt-transcribe" ? "languages[]" : "language", "es");
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new SellerAudioError(
      "La transcripción tardó demasiado. Probá de nuevo o escribime."
    );
  }
  if (!response.ok) {
    throw new SellerAudioError(
      "No pude transcribir el audio. Probá de nuevo o escribime."
    );
  }
  const result = (await response.json()) as { text?: unknown };
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (!text || text.length > MAX_TEXT) {
    throw new SellerAudioError(
      "No te entendí bien el audio. Mandame uno más claro o escribime."
    );
  }
  return { text, bytes: bytes.byteLength };
}
