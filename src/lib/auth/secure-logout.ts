"use client";

import { getQueryClient } from "@/lib/get-query-client";
import { createClient } from "@/lib/supabase/client";
import { purgeAllOfflineData } from "@/modules/offline/storage/offline-db";

export async function secureLogout() {
  await Promise.allSettled([
    purgeAllOfflineData(),
    Promise.resolve().then(() => getQueryClient().clear()),
  ]);

  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.replace("/auth/login");
}
