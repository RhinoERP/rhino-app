"use client";

import { PackageIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateOrgSettingsAction } from "@/modules/organizations/actions/update-org-settings.action";

type CaseUnitsSettingsProps = {
  orgSlug: string;
  caseUnitsEnabled: boolean;
};

export function CaseUnitsSettings({
  orgSlug,
  caseUnitsEnabled,
}: CaseUnitsSettingsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleToggle = (enabled: boolean) => {
    startTransition(async () => {
      const result = await updateOrgSettingsAction(orgSlug, {
        case_units_enabled: enabled,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["org", orgSlug, "settings"],
      });
      router.refresh();
      toast.success("Configuración guardada");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PackageIcon className="size-5" weight="duotone" />
          Cajas y unidades
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-medium text-sm">Usar cajas y unidades sueltas</p>
            <p className="text-muted-foreground text-sm">
              Habilita productos medidos por caja y muestra el stock como cajas
              completas más unidades restantes.
            </p>
          </div>
          <Switch
            checked={caseUnitsEnabled}
            disabled={isPending}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
