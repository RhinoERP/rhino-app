"use server";

import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(
  notificationId: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_id: notificationId,
  });
  if (error) {
    throw new Error("No se pudo marcar la notificación como leída.");
  }
}

export async function markAllNotificationsReadAction(
  orgSlug: string
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mark_all_notifications_read", {
    p_org_slug: orgSlug,
  });
  return data ?? 0;
}
