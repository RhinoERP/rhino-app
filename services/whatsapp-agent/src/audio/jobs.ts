import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type LeasedJob, leased } from "../jobs.ts";
import type { AgentJob } from "../worker.js";
import { AUDIO_BUCKET, AudioError, audioEnabled } from "./config.ts";
import {
  type InspectedAudio,
  inspectAudio,
  readAudioBytes,
  transcribeAudio,
} from "./provider.ts";

type Asset = {
  message_id: string;
  status: string;
  stored: boolean;
  media_id: string | null;
  storage_path: string;
  sha256: string | null;
  expires_at: string;
};
const mediaIdPattern = /^[0-9]+$/;
const versionPattern = /^v\d+\.\d+$/;
const mediaDomains = [
  ".facebook.com",
  ".fbsbx.com",
  ".fbcdn.net",
  ".whatsapp.net",
];

async function downloadMetaAudio(
  db: SupabaseClient,
  job: LeasedJob,
  asset: Asset
): Promise<Uint8Array> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  if (!(token && asset.media_id && mediaIdPattern.test(asset.media_id))) {
    throw new AudioError(
      "AUDIO_MEDIA",
      "No se recibió una referencia de audio válida."
    );
  }
  const integration = await db
    .from("whatsapp_integrations")
    .select("phone_number_id")
    .eq("id", job.integration_id)
    .eq("organization_id", job.organization_id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (integration.error) {
    throw new AudioError(
      "AUDIO_INTEGRATION",
      "No se pudo comprobar la integración.",
      503,
      true
    );
  }
  if (!integration.data) {
    throw new AudioError(
      "AUDIO_INTEGRATION",
      "La integración está desactivada."
    );
  }
  const version = process.env.WHATSAPP_META_GRAPH_VERSION || "v23.0";
  if (!versionPattern.test(version)) {
    throw new Error("Versión de Meta inválida.");
  }
  const response = await fetch(
    `https://graph.facebook.com/${version}/${asset.media_id}?phone_number_id=${encodeURIComponent(integration.data.phone_number_id)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    }
  );
  if (!response.ok) {
    throw new AudioError(
      "AUDIO_MEDIA",
      "Meta no pudo entregar el audio. Pedile al cliente que lo reenvíe.",
      502,
      response.status >= 500 || response.status === 429
    );
  }
  const metadata = (await response.json()) as { url?: string };
  const url = new URL(metadata.url || "invalid:");
  if (
    url.protocol !== "https:" ||
    url.port ||
    !mediaDomains.some((domain) => url.hostname.endsWith(domain))
  ) {
    throw new AudioError(
      "AUDIO_MEDIA",
      "Meta devolvió una dirección de audio inválida."
    );
  }
  return readAudioBytes(
    await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    })
  );
}

async function downloadAudio(
  db: SupabaseClient,
  job: LeasedJob,
  asset: Asset
): Promise<Uint8Array> {
  if (!asset.stored) {
    return downloadMetaAudio(db, job, asset);
  }
  const result = await db.storage
    .from(AUDIO_BUCKET)
    .download(asset.storage_path);
  if (result.error || !result.data) {
    throw new AudioError(
      "AUDIO_DOWNLOAD",
      "No se pudo recuperar el archivo guardado.",
      502,
      true
    );
  }
  return new Uint8Array(await result.data.arrayBuffer());
}

async function storeAudio(
  db: SupabaseClient,
  asset: Asset,
  audio: InspectedAudio,
  digest: string
): Promise<void> {
  const uploaded = await db.storage
    .from(AUDIO_BUCKET)
    .upload(asset.storage_path, audio.bytes, {
      contentType: audio.mimeType,
      upsert: false,
    });
  if (!uploaded.error) {
    return;
  }
  const duplicate =
    uploaded.error.message.toLowerCase().includes("already exists") ||
    ("statusCode" in uploaded.error &&
      String(uploaded.error.statusCode) === "409");
  if (!duplicate) {
    throw new AudioError(
      "AUDIO_STORAGE",
      "No se pudo guardar el audio.",
      502,
      true
    );
  }
  const existing = await db.storage
    .from(AUDIO_BUCKET)
    .download(asset.storage_path);
  if (
    !existing.data ||
    createHash("sha256")
      .update(new Uint8Array(await existing.data.arrayBuffer()))
      .digest("hex") !== digest
  ) {
    throw new Error("El archivo guardado no coincide con el recibido.");
  }
}

async function validateAndStore(
  db: SupabaseClient,
  job: LeasedJob,
  asset: Asset
): Promise<InspectedAudio> {
  const bytes = await downloadAudio(db, job, asset);
  const audio = await inspectAudio(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (asset.sha256 && asset.sha256 !== digest) {
    throw new AudioError(
      "AUDIO_CHANGED",
      "El archivo cambió desde su primera validación."
    );
  }
  // Reject over-quota work before creating a persistent copy in Storage.
  await admitTranscription(db, job, audio.durationSeconds);
  if (!asset.stored) {
    await storeAudio(db, asset, audio, digest);
  }
  const result = await db.rpc("validate_whatsapp_audio_asset", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_mime_type: audio.mimeType,
    p_byte_size: bytes.length,
    p_duration_seconds: audio.durationSeconds,
    p_sha256: digest,
  });
  if (result.error || !result.data) {
    throw new Error("No se pudo guardar la validación del audio.");
  }
  return audio;
}

async function admitTranscription(
  db: SupabaseClient,
  job: LeasedJob,
  seconds: number
): Promise<void> {
  const quota = await db.rpc("reserve_whatsapp_audio_usage", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_seconds: seconds,
  });
  if (quota.error) {
    throw new AudioError(
      "AUDIO_QUOTA_UNAVAILABLE",
      "No se pudo comprobar la cuota de audios. Volvé a intentar.",
      503,
      true
    );
  }
  if (!quota.data) {
    throw new AudioError(
      "AUDIO_QUOTA",
      "Se alcanzó la cuota diaria de audios o el trabajo perdió su exclusión.",
      429
    );
  }
  const eligible = await db.rpc("assert_whatsapp_audio_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
  });
  if (eligible.error) {
    throw new AudioError(
      "AUDIO_ELIGIBILITY",
      "No se pudo comprobar el estado de la conversación.",
      503,
      true
    );
  }
  if (!eligible.data) {
    throw new AudioError(
      "AUDIO_PAUSED",
      "La conversación fue pausada o los audios se deshabilitaron."
    );
  }
}

export async function processAudioJob(
  db: SupabaseClient,
  raw: AgentJob
): Promise<undefined> {
  const job = leased(raw);
  if (!audioEnabled()) {
    throw new AudioError(
      "AUDIO_DISABLED",
      "La transcripción de audio está deshabilitada.",
      503
    );
  }
  const result = await db
    .from("whatsapp_audio_assets")
    .select("*")
    .eq("message_id", job.source_message_id)
    .eq("organization_id", job.organization_id)
    .eq("conversation_id", job.conversation_id)
    .single();
  if (result.error || !result.data) {
    throw new Error("No se encontró el archivo del trabajo.");
  }
  const asset = result.data as Asset;
  if (asset.status === "SUCCEEDED") {
    return;
  }
  if (asset.status === "FAILED" || Date.parse(asset.expires_at) <= Date.now()) {
    throw new AudioError(
      "AUDIO_EXPIRED",
      "El audio falló o venció. Volvé a cargarlo."
    );
  }
  const audio = await validateAndStore(db, job, asset);
  const transcript = await transcribeAudio(audio);
  const saved = await db.rpc("complete_whatsapp_transcription", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_text: transcript.text,
    p_model: transcript.model,
    p_request_id: transcript.requestId,
    p_latency_ms: transcript.latencyMs,
  });
  if (saved.error || !saved.data) {
    throw new Error(
      "No se pudo persistir la transcripción; el trabajo debe recuperarse."
    );
  }
}
