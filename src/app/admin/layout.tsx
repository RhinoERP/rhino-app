import { Suspense } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNavbar } from "@/components/admin/admin-navbar";
import { createClient } from "@/lib/supabase/server";

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

async function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <AdminNavbar userEmail={user?.email} />
      <main className="flex flex-1 flex-col items-center">
        <div className="flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-7xl flex-1 flex-col gap-8 p-5">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminGuard>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </AdminGuard>
    </Suspense>
  );
}
