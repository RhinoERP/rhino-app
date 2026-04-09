"use client";

import {
  ArrowRightIcon,
  FoldersIcon,
  ReceiptIcon,
  UserGearIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";

type QuickLink = {
  title: string;
  description: string;
  icon: typeof UsersIcon;
  href: string;
  module?: "pos";
};

type ConfigurationQuickLinksProps = {
  orgSlug: string;
  posEnabled: boolean;
};

export function ConfigurationQuickLinks({
  orgSlug,
  posEnabled,
}: ConfigurationQuickLinksProps) {
  const quickLinks: QuickLink[] = [
    {
      title: "Gestionar Miembros",
      description:
        "Invita nuevos miembros, gestiona roles y permisos de usuarios",
      icon: UsersIcon,
      href: `/org/${orgSlug}/configuracion/miembros`,
    },
    {
      title: "Configurar Roles",
      description: "Crea y edita roles personalizados con permisos específicos",
      icon: UserGearIcon,
      href: `/org/${orgSlug}/configuracion/roles`,
    },
    {
      title: "Organizar Categorías",
      description: "Administra las categorías y subcategorías de tus productos",
      icon: FoldersIcon,
      href: `/org/${orgSlug}/configuracion/categorias`,
    },
    {
      title: "Configurar Cajas POS",
      description: "Crea terminales de caja para operar venta directa",
      icon: ReceiptIcon,
      href: `/org/${orgSlug}/configuracion/terminales-pos`,
      module: "pos",
    },
  ];
  const moduleFlags = {
    wholesale_enabled: true,
    pos_enabled: posEnabled,
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {quickLinks
        .filter((link) => {
          if (!link.module) {
            return true;
          }
          return isOrganizationModuleEnabled(moduleFlags, link.module);
        })
        .map((link) => {
          const IconComponent = link.icon;

          return (
            <Link href={link.href} key={link.title}>
              <Card className="group transition-all hover:border-primary hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <IconComponent
                          className="size-5 text-primary"
                          weight="duotone"
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base group-hover:text-primary">
                          {link.title}
                        </CardTitle>
                      </div>
                    </div>
                    <ArrowRightIcon
                      className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                      weight="bold"
                    />
                  </div>
                  <CardDescription className="pt-2 text-sm">
                    {link.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
    </div>
  );
}
