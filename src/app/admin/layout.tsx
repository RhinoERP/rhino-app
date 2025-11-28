import { Suspense } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AuthButton } from "@/components/auth/auth-button";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center">
          <div className="text-muted-foreground text-sm">Loading...</div>
        </main>
      }
    >
      <AdminGuard>
        <main className="flex min-h-screen flex-col items-center">
          <div className="flex w-full flex-1 flex-col items-center gap-20">
            <nav className="flex h-16 w-full justify-center border-b border-b-foreground/10 bg-destructive/10">
              <div className="flex w-full max-w-7xl items-center justify-between p-3 px-5 text-sm">
                <div className="flex items-center gap-5 font-semibold">
                  <div className="flex items-center gap-2">
                    <Suspense
                      fallback={
                        <div className="text-muted-foreground text-sm">
                          Loading...
                        </div>
                      }
                    >
                      <AuthButton />
                    </Suspense>
                  </div>
                </div>
              </div>
            </nav>
            <div className="flex w-full max-w-7xl flex-1 flex-col gap-8 p-5">
              {children}
            </div>
          </div>
        </main>
      </AdminGuard>
    </Suspense>
  );
}
