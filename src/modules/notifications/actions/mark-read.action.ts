"use server";

import { createClient } from "@/lib/supabase/server";

type RpcResult<T> = { data: T | null; error: unknown };
type SupabaseRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<RpcResult<unknown>>;

function rpc(supabase: Awaited<ReturnType<typeof createClient>>): SupabaseRpc {
  return supabase.rpc as unknown as SupabaseRpc;
}

export async function markNotificationReadAction(
  notificationId: string
): Promise<void> {
  const supabase = await createClient();
  await rpc(supabase)("mark_notification_read", { p_id: notificationId });
}

export async function markAllNotificationsReadAction(
  orgSlug: string
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await rpc(supabase)("mark_all_notifications_read", {
    p_org_slug: orgSlug,
  });
  return error ? 0 : ((data as number | null) ?? 0);
}
