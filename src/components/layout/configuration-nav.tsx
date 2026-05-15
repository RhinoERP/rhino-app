"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  BuildingIcon,
  CalendarCheckIcon,
  EnvelopeSimpleIcon,
  FoldersIcon,
  LightningIcon,
  PercentIcon,
  ReceiptIcon,
  ShoppingCartSimpleIcon,
  TruckIcon,
  UserGearIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";

type ConfigNavItem = {
  title: string;
  url: (slug: string) => string;
  icon: Icon;
  exact?: boolean;
  module?: "pos";
};

const configNavItems: ConfigNavItem[] = [
  {
    title: "Organización",
    url: (slug: string) => `/org/${slug}/configuracion`,
    icon: BuildingIcon,
    exact: true,
  },
  {
    title: "Miembros",
    url: (slug: string) => `/org/${slug}/configuracion/miembros`,
    icon: UsersIcon,
  },
  {
    title: "Roles",
    url: (slug: string) => `/org/${slug}/configuracion/roles`,
    icon: UserGearIcon,
  },
  {
    title: "Categorías",
    url: (slug: string) => `/org/${slug}/configuracion/categorias`,
    icon: FoldersIcon,
  },
  {
    title: "Impuestos",
    url: (slug: string) => `/org/${slug}/configuracion/impuestos`,
    icon: PercentIcon,
  },
  {
    title: "Preventa",
    url: (slug: string) => `/org/${slug}/configuracion/preventa`,
    icon: ReceiptIcon,
  },
  {
    title: "Venta directa",
    url: (slug: string) => `/org/${slug}/configuracion/venta-directa`,
    icon: ShoppingCartSimpleIcon,
    module: "pos",
  },
  {
    title: "Terminales POS",
    url: (slug: string) => `/org/${slug}/configuracion/terminales-pos`,
    icon: ReceiptIcon,
    module: "pos",
  },
  {
    title: "Comprobantes",
    url: (slug: string) => `/org/${slug}/configuracion/comprobantes`,
    icon: ReceiptIcon,
  },
  {
    title: "Transportes",
    url: (slug: string) => `/org/${slug}/configuracion/transportes`,
    icon: TruckIcon,
  },
  {
    title: "Condiciones de Venta",
    url: (slug: string) => `/org/${slug}/configuracion/condiciones-de-venta`,
    icon: CalendarCheckIcon,
  },
  {
    title: "ARCA",
    url: (slug: string) => `/org/${slug}/configuracion/arca`,
    icon: LightningIcon,
  },
  {
    title: "Emails de factura",
    url: (slug: string) => `/org/${slug}/configuracion/emails-de-factura`,
    icon: EnvelopeSimpleIcon,
  },
];

type ConfigurationNavProps = {
  orgSlug: string;
  posEnabled: boolean;
};

export function ConfigurationNav({
  orgSlug,
  posEnabled,
}: ConfigurationNavProps) {
  const pathname = usePathname();
  const moduleFlags = {
    wholesale_enabled: true,
    pos_enabled: posEnabled,
  };

  return (
    <nav className="space-y-1.5">
      <h2 className="font- mb-4 px-3 text-muted-foreground text-sm">
        Configuración
      </h2>
      {configNavItems
        .filter((item) => {
          if (!item.module) {
            return true;
          }
          return isOrganizationModuleEnabled(moduleFlags, item.module);
        })
        .map((item) => {
          const url = item.url(orgSlug);
          const isActive = item.exact
            ? pathname === url
            : pathname === url || pathname.startsWith(`${url}/`);
          const IconComponent = item.icon;

          return (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              href={url}
              key={url}
            >
              <IconComponent className="size-5" weight="duotone" />
              <span>{item.title}</span>
            </Link>
          );
        })}
    </nav>
  );
}
