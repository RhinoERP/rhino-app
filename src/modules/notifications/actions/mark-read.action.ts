"use server";

import { createAdminClient } from "@/lib/supabase/admin-client";

export async function markNotificationReadAction(
  notificationId: string
): Promise<void> {
  const supabase = await createAdminClient();
  await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown }>
  )("mark_notification_read", { p_id: notificationId });
}

export async function markAllNotificationsReadAction(
  orgSlug: string
): Promise<number> {
  const supabase = await createAdminClient();
  const { data } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: number | null }>
  )("mark_all_notifications_read", { p_org_slug: orgSlug });
  return data ?? 0;
}
