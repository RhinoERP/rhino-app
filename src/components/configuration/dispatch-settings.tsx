"use client";

import { PercentIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

type DispatchSettingsProps = {
  orgSlug: string;
};

export function DispatchSettings({ orgSlug }: DispatchSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [percentage, setPercentage] = useState("");

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        setPercentage(
          String(result.data.dispatch_declared_value_percentage ?? 0)
        );
      }
      setIsLoading(false);
    });
  }, [orgSlug]);

  async function handleSave() {
    const value = Number(percentage);

    if (Number.isNaN(value) || value < 0 || value > 100) {
      toast.error("Ingresá un porcentaje entre 0 y 100");
      return;
    }

    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      dispatch_declared_value_percentage: value,
    });
    setIsSaving(false);

    if (result.success) {
      toast.success("Configuración guardada");
    } else {
      toast.error(result.error ?? "Error al guardar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PercentIcon className="size-5" weight="duotone" />
          Valor declarado en despacho
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label
                className="block font-medium text-sm"
                htmlFor="declared-value-percentage"
              >
                Porcentaje del valor declarado
              </label>
              <div className="flex items-center gap-2">
                <Input
                  className="w-40"
                  id="declared-value-percentage"
                  max={100}
                  min={0}
                  onChange={(e) => setPercentage(e.target.value)}
                  type="number"
                  value={percentage}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Al despachar, el valor declarado se precarga con este porcentaje
                del total del pedido. Se puede editar en cada despacho.
              </p>
            </div>

            <div className="flex justify-end">
              <Button disabled={isSaving} onClick={handleSave} type="button">
                {isSaving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
