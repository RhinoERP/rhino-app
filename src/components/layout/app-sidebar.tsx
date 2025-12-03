import {
  BagIcon,
  HandshakeIcon,
  ShoppingCartIcon,
  SquaresFourIcon,
  UsersIcon,
} from "@phosphor-icons/react/ssr";
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
      icon: <SquaresFourIcon weight="duotone" />,
    },
    {
      title: "Ventas",
      url: `/org/${orgSlug}/ventas`,
      icon: <ShoppingCartIcon weight="duotone" />,
    },
    {
      title: "Compras",
      url: `/org/${orgSlug}/compras`,
      icon: <BagIcon weight="duotone" />,
    },
    {
      title: "Clientes",
      url: `/org/${orgSlug}/clientes`,
      icon: <UsersIcon weight="duotone" />,
    },
    {
      title: "Proveedores",
      url: `/org/${orgSlug}/suppliers`,
      icon: <HandshakeIcon weight="duotone" />,
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
            name: user?.user_metadata?.full_name as string | undefined,
            avatar: user?.picture as string | undefined,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
