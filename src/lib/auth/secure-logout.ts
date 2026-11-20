"use client";

import { getQueryClient } from "@/lib/get-query-client";
import { createClient } from "@/lib/supabase/client";
import { purgeAllOfflineData } from "@/modules/offline/storage/offline-db";

export async function secureLogout() {
  try {
    await purgeAllOfflineData();
  } catch {
    throw new Error(
      "No se pudieron borrar los datos offline. La sesión sigue abierta; revisá el almacenamiento del dispositivo y volvé a intentar."
    );
  }

  getQueryClient().clear();

  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error("No se pudo cerrar la sesión. Intentá de nuevo.");
  }
  window.location.replace("/auth/login");
}
