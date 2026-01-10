"use client";

import {
  HandCoinsIcon,
  HandshakeIcon,
  ListBulletsIcon,
  PackageIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SquaresFourIcon,
  UploadSimpleIcon,
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

type NavItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  requiredPermission?: string;
};

type NavCategory = {
  title: string;
  items: NavItem[];
};

export function AppSidebar({ orgSlug, user, organizations }: AppSidebarProps) {
  const { can } = usePermissions();

  const navCategories: NavCategory[] = [
    {
      title: "Dashboard",
      items: [
        {
          title: "Torre de Control",
          url: `/org/${orgSlug}/`,
          icon: <SquaresFourIcon weight="duotone" />,
          requiredPermission: "dashboard.read",
        },
      ],
    },
    {
      title: "Ventas",
      items: [
        {
          title: "Ventas",
          url: `/org/${orgSlug}/ventas`,
          icon: <ShoppingBagIcon weight="duotone" />,
          requiredPermission: "sales.read",
        },
        {
          title: "Cobranzas",
          url: `/org/${orgSlug}/cobranzas`,
          icon: <HandCoinsIcon weight="duotone" />,
          requiredPermission: "collections.read",
        },
        {
          title: "Clientes",
          url: `/org/${orgSlug}/clientes`,
          icon: <UsersIcon weight="duotone" />,
          requiredPermission: "customers.read",
        },
      ],
    },
    {
      title: "Compras",
      items: [
        {
          title: "Compras",
          url: `/org/${orgSlug}/compras`,
          icon: <ShoppingCartIcon weight="duotone" />,
          requiredPermission: "purchases.read",
        },
        {
          title: "Proveedores",
          url: `/org/${orgSlug}/proveedores`,
          icon: <HandshakeIcon weight="duotone" />,
          requiredPermission: "suppliers.read",
        },
      ],
    },
    {
      title: "Inventario",
      items: [
        {
          title: "Stock",
          url: `/org/${orgSlug}/stock`,
          icon: <PackageIcon weight="duotone" />,
          requiredPermission: "inventory.read",
        },
      ],
    },
    {
      title: "Configuración",
      items: [
        {
          title: "Listas de precios",
          url: `/org/${orgSlug}/precios/listas-de-precios`,
          icon: <ListBulletsIcon weight="duotone" />,
          requiredPermission: "pricelists.read",
        },
        {
          title: "Importar",
          url: `/org/${orgSlug}/import`,
          icon: <UploadSimpleIcon weight="duotone" />,
          requiredPermission: "organization.admin",
        },
      ],
    },
  ];

  // Filter categories and items based on permissions
  const filteredCategories = navCategories
    .map((category) => ({
      ...category,
      items: category.items
        .filter((item) => {
          if (!item.requiredPermission) {
            return true;
          }
          return can(item.requiredPermission);
        })
        .map(({ requiredPermission, ...item }) => item),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AppLogo />
        <OrganizationSwitcher organizations={organizations} orgSlug={orgSlug} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain categories={filteredCategories} />
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
