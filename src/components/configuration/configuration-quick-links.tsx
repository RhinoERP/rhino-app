"use client";

import {
  ArrowRightIcon,
  FoldersIcon,
  LightningIcon,
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

type QuickLink = {
  title: string;
  description: string;
  icon: typeof UsersIcon;
  href: string;
};

type ConfigurationQuickLinksProps = {
  orgSlug: string;
};

export function ConfigurationQuickLinks({
  orgSlug,
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
      title: "Configurar ARCA",
      description:
        "Define el ambiente, el punto de venta y las credenciales ARCA de tu organización",
      icon: LightningIcon,
      href: `/org/${orgSlug}/configuracion/arca`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {quickLinks.map((link) => {
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
