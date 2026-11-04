import { createClient } from "@/lib/supabase/client";
import type { SimulationState } from "@/modules/whatsapp/server/simulation";

export type Upload = {
  uploadId: string;
  state: SimulationState;
  bucket: string;
  path: string;
  token: string;
};
export async function requestAudio<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const result = await response.json().catch(() => null);
  if (!(response.ok && result)) {
    throw new Error(result?.error || "No se pudo procesar el audio.");
  }
  return result as T;
}

export async function uploadAudioFile({
  base,
  file,
  clientMessageId,
  state,
  customerId,
  priceListId,
  onSessionReady,
}: {
  base: string;
  file: File;
  clientMessageId: string;
  state: SimulationState | undefined;
  customerId: string;
  priceListId: string;
  onSessionReady: (state: SimulationState) => void;
}): Promise<Upload> {
  const upload = await requestAudio<Upload>(`${base}/uploads`, {
    method: "POST",
    body: JSON.stringify({
      clientMessageId,
      state,
      customerId: state ? undefined : customerId,
      priceListId: state ? undefined : priceListId,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  onSessionReady(upload.state);
  const result = await createClient()
    .storage.from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (
    result.error &&
    !(
      ("statusCode" in result.error &&
        String(result.error.statusCode) === "409") ||
      result.error.message.toLowerCase().includes("already exists")
    )
  ) {
    throw new Error("No se pudo subir el audio. Volvé a intentar.");
  }
  return upload;
}
