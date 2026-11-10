import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient(request?: NextRequest) {
  const cookieStore = request ? undefined : await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!(url && key)) {
    throw new Error("Missing Supabase environment variables");
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request?.cookies.getAll() ?? cookieStore?.getAll() ?? [];
      },
      setAll(cookiesToSet) {
        // The proxy owns session refresh for route handlers.
        if (!cookieStore) {
          return;
        }
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have proxy refreshing
          // user sessions.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
