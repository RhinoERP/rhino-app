"use client";

import { createClient } from "@/lib/supabase/client";

export function getCurrentPageLoginUrl() {
  const redirectTo = `${window.location.pathname}${window.location.search}`;
  return `/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export function openLoginForCurrentPage() {
  window.open(getCurrentPageLoginUrl(), "_blank", "noopener,noreferrer");
}

export async function hasActiveBrowserSession(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  return !(error || !data.session);
}
