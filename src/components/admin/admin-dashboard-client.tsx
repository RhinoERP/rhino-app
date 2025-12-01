"use client";

import { Building2, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
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
};

export function AdminDashboardClient({
  initialOrganizations,
}: AdminDashboardClientProps) {
  const [organizations, setOrganizations] = useState(initialOrganizations);

  const handleOrganizationCreated = (organization: Organization) => {
    setOrganizations((prev) => [organization, ...prev]);
  };

  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      {/* Statistics cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Organizaciones Activas
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <OrganizationsCount count={organizations.length} />
            <p className="text-muted-foreground text-xs">
              Total de organizaciones en la plataforma
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Usuarios Totales
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">-</div>
            <p className="text-muted-foreground text-xs">
              Usuarios registrados en el sistema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Crecimiento</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">-</div>
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
