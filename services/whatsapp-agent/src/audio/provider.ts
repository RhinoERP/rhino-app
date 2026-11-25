import { type IAudioMetadata, parseBuffer } from "music-metadata";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_SECONDS,
  AUDIO_MAX_TEXT,
  AudioError,
  transcriptionModel,
} from "./config.ts";

export type InspectedAudio = {
  mimeType: string;
  extension: string;
  durationSeconds: number;
  bytes: Uint8Array;
};
export type Transcription = {
  text: string;
  model: string;
  durationSeconds: number;
  requestId: string | null;
  languages: string[];
  latencyMs: number;
};

const formats = [
  [/ogg/, "audio/ogg", "ogg"],
  [/webm|matroska|ebml/, "audio/webm", "webm"],
  [/mpeg-4|m4a|isom|mp4|quicktime/, "audio/mp4", "m4a"],
  [/wave|wav/, "audio/wav", "wav"],
  [/mpeg|mp3/, "audio/mpeg", "mp3"],
] as const;

export async function inspectAudio(bytes: Uint8Array): Promise<InspectedAudio> {
  if (!bytes.length || bytes.length > AUDIO_MAX_BYTES) {
    throw new AudioError(
      "AUDIO_SIZE",
      "El audio debe pesar entre 1 byte y 4 MB.",
      413
    );
  }
  let metadata: IAudioMetadata;
  try {
    metadata = await parseBuffer(bytes, undefined, {
      duration: true,
      skipCovers: true,
    });
  } catch {
    throw new AudioError(
      "AUDIO_FORMAT",
      "El archivo no es un audio válido. Probá con MP3, M4A, OGG, WAV o WebM.",
      415
    );
  }
  const container = metadata.format.container?.toLowerCase() || "";
  const format = formats.find(([pattern]) => pattern.test(container));
  if (
    !format ||
    metadata.format.hasAudio !== true ||
    metadata.format.hasVideo === true
  ) {
    throw new AudioError(
      "AUDIO_FORMAT",
      "Ese formato no está admitido. Usá MP3, M4A, OGG, WAV o WebM.",
      415
    );
  }
  const durationSeconds = metadata.format.duration;
  if (
    !(durationSeconds && Number.isFinite(durationSeconds)) ||
    durationSeconds > AUDIO_MAX_SECONDS + 0.1
  ) {
    throw new AudioError(
      "AUDIO_DURATION",
      "El audio debe tener una duración verificable de hasta 2 minutos."
    );
  }
  return { bytes, mimeType: format[1], extension: format[2], durationSeconds };
}

export async function readAudioBytes(response: Response): Promise<Uint8Array> {
  if (!(response.ok && response.body)) {
    throw new AudioError(
      "AUDIO_DOWNLOAD",
      "No se pudo descargar el audio.",
      502,
      true
    );
  }
  if (Number(response.headers.get("content-length")) > AUDIO_MAX_BYTES) {
    await response.body.cancel();
    throw new AudioError("AUDIO_SIZE", "El audio supera los 4 MB.", 413);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      size += next.value.length;
      if (size > AUDIO_MAX_BYTES) {
        await reader.cancel();
        throw new AudioError("AUDIO_SIZE", "El audio supera los 4 MB.", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function transcribeAudio(
  audio: InspectedAudio,
  request: typeof fetch = fetch
): Promise<Transcription> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new AudioError(
      "AUDIO_CONFIGURATION",
      "Falta configurar OPENAI_API_KEY en el servidor.",
      503
    );
  }
  const model = transcriptionModel();
  const form = new FormData();
  form.set("model", model);
  form.set(
    "file",
    new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }),
    `audio.${audio.extension}`
  );
  form.set(model === "gpt-transcribe" ? "languages[]" : "language", "es");
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await request("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new AudioError(
      "AUDIO_TIMEOUT",
      "La transcripción no respondió a tiempo. Podés reintentar.",
      504,
      true
    );
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new AudioError(
      "AUDIO_PROVIDER",
      response.status === 401 ||
        response.status === 403 ||
        response.status === 404
        ? "La API key o el proyecto no tienen acceso al modelo de transcripción configurado."
        : "El proveedor no pudo transcribir el audio. Volvé a intentar.",
      502,
      retryable
    );
  }
  const result = (await response.json()) as {
    text?: unknown;
    languages?: Array<{ code?: unknown }>;
  };
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (!text || text.length > AUDIO_MAX_TEXT) {
    throw new AudioError(
      "AUDIO_EMPTY",
      "No pude obtener una transcripción utilizable. Reenviá un audio más claro o escribí el mensaje."
    );
  }
  return {
    text,
    model,
    durationSeconds: audio.durationSeconds,
    requestId: response.headers.get("x-request-id"),
    languages: (result.languages || []).flatMap(({ code }) =>
      typeof code === "string" ? [code] : []
    ),
    latencyMs: Date.now() - startedAt,
  };
}
