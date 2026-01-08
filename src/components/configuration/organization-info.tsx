"use client";

import {
  BuildingIcon,
  CalendarIcon,
  IdentificationCardIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

type OrganizationInfoProps = {
  organization: {
    name: string;
    cuit?: string | null;
    created_at: string | null;
  };
};

export function OrganizationInfo({ organization }: OrganizationInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BuildingIcon className="size-5" weight="duotone" />
          Información de la Organización
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <BuildingIcon
            className="mt-0.5 size-5 text-muted-foreground"
            weight="duotone"
          />
          <div>
            <p className="text-muted-foreground text-sm">Nombre</p>
            <p className="font-medium">{organization.name}</p>
          </div>
        </div>

        {organization.cuit && (
          <div className="flex items-start gap-3">
            <IdentificationCardIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">CUIT</p>
              <p className="font-medium font-mono">{organization.cuit}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <CalendarIcon
            className="mt-0.5 size-5 text-muted-foreground"
            weight="duotone"
          />
          <div>
            <p className="text-muted-foreground text-sm">Fecha de creación</p>
            <p className="font-medium">
              {organization.created_at
                ? formatDateTime(organization.created_at)
                : "N/A"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
