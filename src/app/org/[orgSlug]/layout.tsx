import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PermissionsProvider } from "@/components/auth/permissions-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type OrganizationLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

async function OrganizationLayoutContent({
  children,
  params,
}: OrganizationLayoutProps) {
  const { orgSlug } = await params;

  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/");
  }

  const { permissions, user, organizations } = layoutData;

  return (
    <PermissionsProvider initialPermissions={permissions} orgSlug={orgSlug}>
      <SidebarProvider>
        <AppSidebar
          organizations={organizations}
          orgSlug={orgSlug}
          user={{
            email: user?.email as string | undefined,
            name: user?.user_metadata?.full_name as string | undefined,
            avatar: user?.picture as string | undefined,
          }}
        />
        <SidebarInset>
          <div className="flex flex-1 flex-col gap-4 p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionsProvider>
  );
}

export default function OrganizationLayout(props: OrganizationLayoutProps) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrganizationLayoutContent {...props} />
    </Suspense>
  );
}
