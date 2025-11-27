import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Verify that the user is authenticated
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    redirect("/auth/login");
  }

  // Verify that the user is a superadmin
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) {
    redirect("/protected");
  }

  return <>{children}</>;
}
