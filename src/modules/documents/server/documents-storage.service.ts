import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { getDocumentPath } from "../utils/document-reference";

const BUCKET = "documents";
const SIGNED_URL_TTL_SECONDS = 5 * 60;

export async function downloadStoredDocument(
  reference: string,
  client?: SupabaseServerClient
): Promise<Buffer> {
  const path = getDocumentPath(reference);
  if (!path) {
    throw new Error("La referencia del documento no es válida");
  }

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) {
    throw new Error(`No se pudo descargar el documento: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function createDocumentSignedUrl(
  reference: string,
  client?: SupabaseServerClient
): Promise<string> {
  const path = getDocumentPath(reference);
  if (!path) {
    throw new Error("La referencia del documento no es válida");
  }

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    throw new Error(`No se pudo autorizar el documento: ${error.message}`);
  }

  return data.signedUrl;
}
