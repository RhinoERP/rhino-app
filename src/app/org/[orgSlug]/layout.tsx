import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PermissionsProvider } from "@/components/auth/permissions-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { OrderRealtimeNotifications } from "@/components/orders/order-realtime-notifications";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getOrderCountsAction } from "@/modules/orders/actions/get-order-counts.action";
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

  const { permissions, user, organizations, currentOrganization } = layoutData;

  const orderCounts = await getOrderCountsAction(orgSlug);

  return (
    <PermissionsProvider initialPermissions={permissions} orgSlug={orgSlug}>
      <SidebarProvider>
        <AppSidebar
          orderCounts={orderCounts}
          organizations={organizations}
          orgSlug={orgSlug}
          user={{
            email: user?.email as string | undefined,
            name: user?.user_metadata?.full_name as string | undefined,
            avatar: user?.picture as string | undefined,
          }}
        />
        <SidebarInset>
          <OrderRealtimeNotifications
            organizationId={currentOrganization.id}
            orgSlug={orgSlug}
          />
          <div className="flex flex-1 flex-col gap-4 p-6 pb-20 md:pb-6">
            {children}
          </div>
          <BottomNav
            orgSlug={orgSlug}
            wholesaleEnabled={currentOrganization.wholesale_enabled ?? true}
          />
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
