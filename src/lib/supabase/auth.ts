import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export async function requireAuth(): Promise<{
  supabase: SupabaseClient<Database>;
  userId: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims?.sub) {
    return null;
  }

  return {
    supabase,
    userId: authData.claims.sub,
  };
}

export async function requireAuthResponse(): Promise<NextResponse<{
  error: string;
}> | null> {
  const auth = await requireAuth();

  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null;
}
