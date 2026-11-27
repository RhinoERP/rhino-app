import { createAdminClient } from "@/lib/supabase/admin-client";
import type { RouteDayResult } from "../contracts";

/** Only resolves actors already present in the seller-scoped route RPC response. */
export async function withRouteActorNames(
  data: RouteDayResult
): Promise<RouteDayResult> {
  const actorIds = [
    ...new Set(
      data.routes.flatMap((route) => route.events.map((event) => event.actorId))
    ),
  ];
  if (actorIds.length === 0) {
    return data;
  }

  const names = new Map<string, string>();
  try {
    const admin = createAdminClient();
    await Promise.all(
      actorIds.map(async (actorId) => {
        try {
          const { data: userData, error } =
            await admin.auth.admin.getUserById(actorId);
          if (error) {
            throw error;
          }
          const user = userData.user;
          names.set(
            actorId,
            user?.user_metadata?.full_name ||
              user?.user_metadata?.name ||
              user?.email ||
              "Usuario no disponible"
          );
        } catch (error) {
          console.error(
            "No se pudo resolver el actor de un evento de ruta",
            error
          );
        }
      })
    );
  } catch (error) {
    console.error(
      "No se pudo crear el cliente para resolver actores de rutas",
      error
    );
  }

  return {
    ...data,
    routes: data.routes.map((route) => ({
      ...route,
      events: route.events.map((event) => ({
        ...event,
        actorName: names.get(event.actorId) ?? "Usuario no disponible",
      })),
    })),
  };
}
