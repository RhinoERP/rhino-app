"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function resetPasswordAction(email: string) {
  const supabase = await createClient();

  const headersList = await headers();
  const host = headersList.get("host") || "";
  const proto = headersList.get("x-forwarded-proto") || "https";
  const origin = `${proto}://${host}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/auth/update-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
