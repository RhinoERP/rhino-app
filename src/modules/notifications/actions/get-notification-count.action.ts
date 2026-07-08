"use server";

import { createClient } from "@/lib/supabase/server";

export async function getUnreadNotificationCountAction(
  orgSlug: string
): Promise<number> {
  const supabase = await createClient();
  const { data } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: number | null }>
  )("get_unread_notification_count", { p_org_slug: orgSlug });
  return data ?? 0;
}
