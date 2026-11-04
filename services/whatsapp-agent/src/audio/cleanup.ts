import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_BUCKET } from "./config.ts";

type ExpiredAsset = {
  message_id: string;
  storage_path: string;
  status: string;
};

async function removeExpiredAudio(
  db: SupabaseClient,
  asset: ExpiredAsset,
  now: string
): Promise<boolean> {
  const expired = await db.rpc("expire_whatsapp_audio_asset", {
    p_message_id: asset.message_id,
  });
  if (expired.error || !expired.data) {
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
    .order("expires_at")
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
    .order("expires_at")
    .limit(20);
  if (uploads.error) {
    throw new Error("No se pudo consultar la retención de cargas.");
  }
  for (const upload of uploads.data || []) {
    const claimed = await db
      .from("whatsapp_audio_uploads")
      .update({ cleanup_claimed_at: now })
      .eq("id", upload.id)
      .is("message_id", null)
      .lte("expires_at", now)
      .select("id")
      .maybeSingle();
    if (claimed.error || !claimed.data) {
      continue;
    }
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
