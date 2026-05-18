"use client";
import { CurrencyCircleDollar } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

type Props = {
  orgSlug: string;
};
export function InitialBalancesSettings({ orgSlug }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        setEnabled(result.data.initial_balances_enabled);
      }
      setIsLoading(false);
    });
  }, [orgSlug]);
  const handleToggle = async (next: boolean) => {
    setIsSaving(true);
    const current = await getOrganizationSettings(orgSlug);
    if (!(current.success && current.data)) {
      toast.error("Error al leer configuración actual");
      setIsSaving(false);
      return;
    }
    const result = await updateOrganizationSettings(orgSlug, {
      ...current.data,
      initial_balances_enabled: next,
    });
    setIsSaving(false);
    if (result.success) {
      setEnabled(next);
      queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "settings"] });
      toast.success("Configuración guardada");
    } else {
      toast.error(result.error ?? "Error al guardar");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CurrencyCircleDollar className="size-5" weight="duotone" />
          Carga de Saldos Iniciales
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="min-w-0">
              <p className="font-medium text-sm">
                Migración desde sistema anterior
              </p>
              <p className="text-muted-foreground text-sm">
                Habilita la importación de deudas de clientes desde tu sistema
                anterior en el módulo Importar.
              </p>
            </div>
            <Switch
              checked={enabled}
              disabled={isLoading || isSaving}
              onCheckedChange={handleToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
