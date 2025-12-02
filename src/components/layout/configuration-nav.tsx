"use client";

import type { Icon } from "@phosphor-icons/react";
import { BuildingIcon, UsersIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ConfigNavItem = {
  title: string;
  url: (slug: string) => string;
  icon: Icon;
  exact?: boolean;
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
];

type ConfigurationNavProps = {
  orgSlug: string;
};

export function ConfigurationNav({ orgSlug }: ConfigurationNavProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1.5">
      <h2 className="font- mb-4 px-3 text-muted-foreground text-sm">
        Configuración
      </h2>
      {configNavItems.map((item) => {
        const url = item.url(orgSlug);
        const isActive = item.exact
          ? pathname === url
          : pathname === url || pathname.startsWith(`${url}/`);
        const IconComponent = item.icon;

        return (
          <Link
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
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
