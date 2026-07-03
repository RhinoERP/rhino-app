"use server";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "../types";

export async function getUnreadNotificationsAction(
  orgSlug: string
): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown }>
  )("get_unread_notifications", { p_org_slug: orgSlug, p_limit: 50 });
  return (data ?? []) as Notification[];
}
