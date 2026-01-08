"use client";

import { FoldersIcon, UserGearIcon, UsersIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ConfigurationMetric = {
  title: string;
  value: number;
  description: string;
  icon: typeof UsersIcon;
  href: string;
};

type ConfigurationMetricsProps = {
  orgSlug: string;
  metrics: {
    membersCount: number;
    rolesCount: number;
    categoriesCount: number;
    invitationsCount: number;
  };
};

export function ConfigurationMetrics({
  orgSlug,
  metrics,
}: ConfigurationMetricsProps) {
  const configMetrics: ConfigurationMetric[] = [
    {
      title: "Miembros Activos",
      value: metrics.membersCount,
      description: "Usuarios con acceso a la organización",
      icon: UsersIcon,
      href: `/org/${orgSlug}/configuracion/miembros`,
    },
    {
      title: "Invitaciones Pendientes",
      value: metrics.invitationsCount,
      description: "Invitaciones esperando aceptación",
      icon: UsersIcon,
      href: `/org/${orgSlug}/configuracion/miembros`,
    },
    {
      title: "Roles Configurados",
      value: metrics.rolesCount,
      description: "Roles y permisos definidos",
      icon: UserGearIcon,
      href: `/org/${orgSlug}/configuracion/roles`,
    },
    {
      title: "Categorías",
      value: metrics.categoriesCount,
      description: "Categorías para organizar productos",
      icon: FoldersIcon,
      href: `/org/${orgSlug}/configuracion/categorias`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {configMetrics.map((metric) => {
        const IconComponent = metric.icon;

        return (
          <Link href={metric.href} key={metric.title}>
            <Card className="transition-all hover:border-primary hover:shadow-md">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border">
                  <IconComponent
                    className="h-4 w-4 text-muted-foreground"
                    weight="duotone"
                  />
                </div>
                <CardTitle className="font-medium text-sm">
                  {metric.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-bold text-2xl">{metric.value}</div>
                <p className="text-muted-foreground text-xs">
                  {metric.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
