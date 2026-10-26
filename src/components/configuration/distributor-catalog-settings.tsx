"use client";

import { StorefrontIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

type Props = {
  orgSlug: string;
};

export function DistributorCatalogSettings({ orgSlug }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [margin, setMargin] = useState("30");
  const queryClient = useQueryClient();

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        setMargin(String(result.data.distributor_catalog_margin ?? 30));
      }
      setIsLoading(false);
    });
  }, [orgSlug]);

  const handleSave = async () => {
    const parsed = Number(margin);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("El margen debe ser un número entre 0 y 100");
      return;
    }

    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      distributor_catalog_margin: parsed,
    });
    setIsSaving(false);

    if (result.success) {
      queryClient.invalidateQueries({
        queryKey: ["org", orgSlug, "settings"],
      });
      toast.success("Margen guardado");
    } else {
      toast.error(result.error ?? "Error al guardar");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <StorefrontIcon className="size-5" weight="duotone" />
          Catálogo Distribuidor
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="distributor-catalog-margin">
                Margen del catálogo distribuidor (%)
              </Label>
              <p className="text-muted-foreground text-sm">
                El precio que ven los distribuidores se calcula como el costo
                del producto más este porcentaje.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  id="distributor-catalog-margin"
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(event) => setMargin(event.target.value)}
                  value={margin}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <Button disabled={isSaving} onClick={handleSave} size="sm">
              {isSaving ? "Guardando..." : "Guardar margen"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
