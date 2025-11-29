import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isUserMemberOfOrganization } from "@/modules/organizations/service/organizations.service";

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
  const isMember = await isUserMemberOfOrganization(orgSlug);

  if (!isMember) {
    redirect("/");
  }

  return (
    <SidebarProvider>
      <AppSidebar orgSlug={orgSlug} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="mr-2 data-[orientation=vertical]:h-4"
            orientation="vertical"
          />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function OrganizationLayout(props: OrganizationLayoutProps) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrganizationLayoutContent {...props} />
    </Suspense>
  );
}
