import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_BUCKET } from "./config.ts";

type ExpiredAsset = {
  message_id: string;
  storage_path: string;
  status: string;
};

async function expirePendingAudio(
  db: SupabaseClient,
  asset: ExpiredAsset,
  now: string
): Promise<boolean> {
  if (asset.status === "SUCCEEDED") {
    return true;
  }
  const expired = await db
    .from("whatsapp_audio_assets")
    .update({
      status: "FAILED",
      error_code: "AUDIO_EXPIRED",
      error_message: "El audio venció. Pedile al cliente que lo reenvíe.",
    })
    .eq("message_id", asset.message_id)
    .neq("status", "SUCCEEDED");
  if (expired.error) {
    return false;
  }
  await db
    .from("agent_jobs")
    .update({
      status: "FAILED",
      completed_at: now,
      last_error: "El audio venció.",
    })
    .eq("source_message_id", asset.message_id)
    .eq("job_type", "TRANSCRIBE_AUDIO")
    .in("status", ["PENDING", "RETRY"]);
  await db
    .from("agent_jobs")
    .update({ status: "PENDING", available_at: now })
    .eq("source_message_id", asset.message_id)
    .eq("job_type", "PROCESS_CONVERSATION")
    .eq("status", "WAITING");
  return true;
}

async function removeExpiredAudio(
  db: SupabaseClient,
  asset: ExpiredAsset,
  now: string
): Promise<boolean> {
  const active = await db
    .from("agent_jobs")
    .select("id")
    .eq("source_message_id", asset.message_id)
    .eq("status", "PROCESSING")
    .gt("lease_expires_at", now)
    .limit(1);
  if (active.error || active.data?.length) {
    return false;
  }
  if (!(await expirePendingAudio(db, asset, now))) {
    return false;
  }
  const deleted = await db.storage
    .from(AUDIO_BUCKET)
    .remove([asset.storage_path]);
  if (deleted.error) {
    return false;
  }
  const saved = await db
    .from("whatsapp_audio_assets")
    .update({ purged_at: now, stored: false })
    .eq("message_id", asset.message_id);
  return !saved.error;
}

/** Idempotent bounded batches. A file with a live processing lease is retained. */
export async function cleanupAudioFiles(
  db: SupabaseClient
): Promise<{ removed: number }> {
  const now = new Date().toISOString();
  const assets = await db
    .from("whatsapp_audio_assets")
    .select("message_id,storage_path,status")
    .lte("expires_at", now)
    .is("purged_at", null)
    .limit(20);
  if (assets.error) {
    throw new Error("No se pudo consultar la retención de audios.");
  }
  let removed = 0;
  for (const asset of assets.data || []) {
    if (await removeExpiredAudio(db, asset, now)) {
      removed += 1;
    }
  }
  const uploads = await db
    .from("whatsapp_audio_uploads")
    .select("id,storage_path")
    .is("message_id", null)
    .lte("expires_at", now)
    .limit(20);
  for (const upload of uploads.data || []) {
    const deleted = await db.storage
      .from(AUDIO_BUCKET)
      .remove([upload.storage_path]);
    if (!deleted.error) {
      await db
        .from("whatsapp_audio_uploads")
        .delete()
        .eq("id", upload.id)
        .is("message_id", null);
    }
  }
  return { removed };
}
