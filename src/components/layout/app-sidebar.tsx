"use client";

import {
  ChartLineUpIcon,
  HandCoinsIcon,
  HandshakeIcon,
  LightningIcon,
  ListBulletsIcon,
  PackageIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparkleIcon,
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
import {
  isOrganizationModuleEnabled,
  type OrganizationModule,
} from "@/modules/organizations/utils/module-flags";
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
  requiredPermission?: string | string[];
  module?: OrganizationModule;
  comingSoon?: boolean;
};

type NavCategory = {
  title: string;
  items: NavItem[];
};

export function AppSidebar({ orgSlug, user, organizations }: AppSidebarProps) {
  const { can } = usePermissions();
  const currentOrganization = organizations.find((org) => org.slug === orgSlug);

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
        {
          title: "Cobranzas",
          url: `/org/${orgSlug}/cobranzas`,
          icon: <HandCoinsIcon weight="duotone" />,
          requiredPermission: "collections.read",
        },
        {
          title: "Finanzas",
          url: `/org/${orgSlug}/finanzas`,
          icon: <ChartLineUpIcon weight="duotone" />,
          requiredPermission: "finances.read",
        },
      ],
    },
    {
      title: "Ventas",
      items: [
        {
          title: "Presupuestos",
          url: `/org/${orgSlug}/presupuestos/nuevo`,
          icon: <ListBulletsIcon weight="duotone" />,
          requiredPermission: "sales.read",
          module: "wholesale",
        },
        {
          title: "Ventas",
          url: `/org/${orgSlug}/ventas`,
          icon: <ShoppingBagIcon weight="duotone" />,
          requiredPermission: "sales.read",
          module: "wholesale",
        },
        {
          title: "Clientes",
          url: `/org/${orgSlug}/clientes`,
          icon: <UsersIcon weight="duotone" />,
          requiredPermission: "customers.read",
        },
        {
          title: "Notas de Crédito",
          url: `/org/${orgSlug}/notas-de-credito`,
          icon: <ReceiptIcon weight="duotone" />,
          requiredPermission: "creditnotes.read",
        },
      ],
    },
    {
      title: "Venta directa",
      items: [
        {
          title: "Venta directa",
          url: `/org/${orgSlug}/venta-directa`,
          icon: <ReceiptIcon weight="duotone" />,
          requiredPermission: "pos.read",
          module: "pos",
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
          title: "Productos y Stock",
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
          title: "Listas de venta",
          url: `/org/${orgSlug}/precios/listas-de-precios-venta`,
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
    {
      title: "ARCA",
      items: [
        {
          title: "Facturas",
          url: `/org/${orgSlug}/arca/facturas`,
          icon: <ReceiptIcon weight="duotone" />,
          requiredPermission: "arca.read",
        },
        {
          title: "Configuración",
          url: `/org/${orgSlug}/configuracion/arca`,
          icon: <LightningIcon weight="duotone" />,
          requiredPermission: "organization.admin",
        },
      ],
    },
    {
      title: "Integraciones e IA",
      items: [
        {
          title: "IA Comercial",
          url: "#",
          icon: <SparkleIcon weight="duotone" />,
          comingSoon: true,
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
          // Always show coming soon items
          if (item.comingSoon) {
            return true;
          }
          if (
            item.module &&
            !isOrganizationModuleEnabled(currentOrganization, item.module)
          ) {
            return false;
          }
          if (!item.requiredPermission) {
            return true;
          }
          if (Array.isArray(item.requiredPermission)) {
            return item.requiredPermission.some((permission) =>
              can(permission)
            );
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
