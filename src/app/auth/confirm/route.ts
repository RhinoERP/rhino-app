import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (error) {
      const encodedError = encodeURIComponent(error.message);
      redirect(`/auth/error?error=${encodedError}`);
    }
    redirect(next);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const encodedError = encodeURIComponent(error.message);
      redirect(`/auth/error?error=${encodedError}`);
    }
    redirect(next);
  }

  redirect("/auth/error?error=No%20token%20hash%20or%20type");
}
