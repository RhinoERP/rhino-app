import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createWhatsAppAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!(url && secretKey)) {
    throw new Error(
      "Missing Supabase service credentials for WhatsApp webhook"
    );
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
