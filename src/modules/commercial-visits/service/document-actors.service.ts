import { createAdminClient } from "@/lib/supabase/admin-client";
import type { VisitDocumentHistory } from "../contracts";

/** Only resolve actors from an already-authorized, visit-scoped RPC response. */
export async function withDocumentActorNames(
  history: VisitDocumentHistory
): Promise<VisitDocumentHistory> {
  const ids = [...new Set(history.events.map((event) => event.actorId))];
  if (!ids.length) {
    return history;
  }
  const admin = createAdminClient();
  const names = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error) {
          throw error;
        }
        names.set(
          id,
          data.user?.user_metadata?.full_name ||
            data.user?.email ||
            "Usuario no disponible"
        );
      } catch {
        names.set(id, "Usuario no disponible");
      }
    })
  );
  return {
    ...history,
    events: history.events.map((event) => ({
      ...event,
      actorName: names.get(event.actorId) ?? "Usuario no disponible",
    })),
  };
}
