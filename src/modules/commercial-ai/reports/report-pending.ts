import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";

/**
 * Reportes que quedaron esperando a que el vendedor toque "Ver reporte" en la
 * plantilla de WhatsApp. Los devuelve (y los marca como entregados).
 */
export async function takePendingReports(
  organizationId: string,
  userId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("commercial_ai_saved_reports" as never)
    .select("id, whatsapp_pending_text")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .not("whatsapp_pending_text", "is", null)
    .order("whatsapp_pending_at", { ascending: true });
  const rows = (data ?? []) as unknown as {
    id: string;
    whatsapp_pending_text: string;
  }[];
  if (!rows.length) {
    return null;
  }
  await admin
    .from("commercial_ai_saved_reports" as never)
    .update({
      whatsapp_pending_text: null,
      whatsapp_pending_at: null,
    } as never)
    .in(
      "id",
      rows.map((r) => r.id)
    );
  return rows.map((r) => r.whatsapp_pending_text).join("\n\n— — —\n\n");
}
