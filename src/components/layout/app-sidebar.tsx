import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/supabase/admin";
import { AppLogo } from "./app-logo";
import { NavMain } from "./nav-main";
import { OrganizationSwitcher } from "./organization-switcher";
import { SettingsNavItem } from "./settings-nav-item";
import { UserMenu } from "./user-menu";

type AppSidebarProps = {
  orgSlug: string;
};

export async function AppSidebar({ orgSlug }: AppSidebarProps) {
  const user = await getCurrentUser();

  const navItems = [
    {
      title: "Dashboard",
      url: `/org/${orgSlug}`,
      icon: "LayoutDashboard",
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AppLogo />
        <OrganizationSwitcher orgSlug={orgSlug} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <SettingsNavItem orgSlug={orgSlug} />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu
          user={{
            email: user?.email as string | undefined,
            name: user?.name as string | undefined,
            avatar: user?.picture as string | undefined,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
