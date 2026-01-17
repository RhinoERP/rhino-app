"use client";

import { Building2, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { CreateOrganizationForm } from "@/components/admin/create-organization-form";
import { OrganizationsCount } from "@/components/admin/organizations-count";
import { OrganizationsList } from "@/components/admin/organizations-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Organization } from "@/modules/organizations/types";

type AdminDashboardClientProps = {
  initialOrganizations: Organization[];
  initialTotalUsers: number;
};

export function AdminDashboardClient({
  initialOrganizations,
  initialTotalUsers,
}: AdminDashboardClientProps) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [totalUsers] = useState(initialTotalUsers);

  const handleOrganizationCreated = (organization: Organization) => {
    setOrganizations((prev) => [organization, ...prev]);
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentMonthOrgs = organizations.filter((org) => {
      if (!org.created_at) {
        return false;
      }
      const createdDate = new Date(org.created_at);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    });

    const previousMonthOrgs = organizations.filter((org) => {
      if (!org.created_at) {
        return false;
      }
      const createdDate = new Date(org.created_at);
      return (
        createdDate.getMonth() === previousMonth &&
        createdDate.getFullYear() === previousYear
      );
    });

    return {
      totalOrganizations: organizations.length,
      totalUsers,
      growthThisMonth: currentMonthOrgs.length,
      growthLastMonth: previousMonthOrgs.length,
    };
  }, [organizations, totalUsers]);

  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      {/* Statistics cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="font-medium text-sm">
              Organizaciones Activas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrganizationsCount count={metrics.totalOrganizations} />
            <p className="text-muted-foreground text-xs">
              Total de organizaciones en la plataforma
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="font-medium text-sm">
              Usuarios Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{metrics.totalUsers}</div>
            <p className="text-muted-foreground text-xs">
              Usuarios registrados en el sistema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="font-medium text-sm">Crecimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{metrics.growthThisMonth}</div>
            <p className="text-muted-foreground text-xs">
              Nuevas organizaciones este mes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Organizations section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Organizaciones Activas</CardTitle>
              <CardDescription>
                Lista de todas las organizaciones registradas en la plataforma
              </CardDescription>
            </div>
            <CreateOrganizationForm
              onOrganizationCreated={handleOrganizationCreated}
            />
          </div>
        </CardHeader>
        <CardContent>
          <OrganizationsList organizations={organizations} />
        </CardContent>
      </Card>
    </div>
  );
}
