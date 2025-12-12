import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PermissionsProvider } from "@/components/auth/permissions-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getUserOrganizations,
  isUserMemberOfOrganization,
} from "@/modules/organizations/service/organizations.service";

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

async function getPermissionsForOrgSlug(orgSlug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_user_org_permissions_by_slug",
    { target_org_slug: orgSlug }
  );

  if (error) {
    console.error("Error getting permissions", error);
    return [];
  }

  return (data ?? []) as string[];
}

async function OrganizationLayoutContent({
  children,
  params,
}: OrganizationLayoutProps) {
  const { orgSlug } = await params;
  const isMember = await isUserMemberOfOrganization(orgSlug);

  if (!isMember) {
    redirect("/");
  }

  const [permissions, user, organizations] = await Promise.all([
    getPermissionsForOrgSlug(orgSlug),
    getCurrentUser(),
    getUserOrganizations(),
  ]);

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
