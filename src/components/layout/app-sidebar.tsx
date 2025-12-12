"use client";

import {
  HandshakeIcon,
  PackageIcon,
  SquaresFourIcon,
  UsersIcon,
} from "@phosphor-icons/react/ssr";
import { usePermissions } from "@/components/auth/permissions-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import type { Organization } from "@/modules/organizations/types";
import { AppLogo } from "./app-logo";
import { NavMain } from "./nav-main";
import { OrganizationSwitcher } from "./organization-switcher";
import { SettingsNavItem } from "./settings-nav-item";
import { UserMenu } from "./user-menu";

type AppSidebarProps = {
  orgSlug: string;
  user: {
    email?: string;
    name?: string;
    avatar?: string;
  } | null;
  organizations: Organization[];
};

export function AppSidebar({ orgSlug, user, organizations }: AppSidebarProps) {
  const { can } = usePermissions();

  const allNavItems = [
    {
      title: "Dashboard",
      url: `/org/${orgSlug}`,
      icon: <SquaresFourIcon weight="duotone" />,
      requiredPermission: undefined,
    },
    {
      title: "Stock",
      url: `/org/${orgSlug}/stock`,
      icon: <PackageIcon weight="duotone" />,
    },
    {
      title: "Clientes",
      url: `/org/${orgSlug}/clientes`,
      icon: <UsersIcon weight="duotone" />,
      requiredPermission: "customers.read",
    },
    {
      title: "Proveedores",
      url: `/org/${orgSlug}/proveedores`,
      icon: <HandshakeIcon weight="duotone" />,
      requiredPermission: "suppliers.read",
    },
  ];

  const navItems = allNavItems
    .filter((item) => {
      if (!item.requiredPermission) {
        return true;
      }
      return can(item.requiredPermission);
    })
    .map(({ requiredPermission, ...item }) => item);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AppLogo />
        <OrganizationSwitcher organizations={organizations} orgSlug={orgSlug} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        {can("organization.admin") && <SettingsNavItem orgSlug={orgSlug} />}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu
          user={{
            email: user?.email,
            name: user?.name,
            avatar: user?.avatar,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
