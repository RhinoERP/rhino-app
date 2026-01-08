"use client";

import { FoldersIcon, UserGearIcon, UsersIcon } from "@phosphor-icons/react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-medium text-sm">
                    {metric.title}
                  </CardTitle>
                  <IconComponent
                    className="size-4 text-muted-foreground"
                    weight="duotone"
                  />
                </div>
                <div className="pt-2">
                  <div className="font-bold font-heading text-3xl">
                    {metric.value}
                  </div>
                  <CardDescription className="text-xs">
                    {metric.description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
