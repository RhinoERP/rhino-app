"use client";

import { TagIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { countAssignmentsByOrgAction } from "@/modules/customer-supplier-assignments/actions/count-assignments.action";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

type Props = {
  orgSlug: string;
};

export function ConfigurablePriceListsSettings({ orgSlug }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    getOrganizationSettings(orgSlug).then((result) => {
      if (result.success && result.data) {
        setEnabled(result.data.configurable_price_lists_enabled);
      }
      setIsLoading(false);
    });
  }, [orgSlug]);

  const save = async (next: boolean) => {
    setIsSaving(true);
    const result = await updateOrganizationSettings(orgSlug, {
      configurable_price_lists_enabled: next,
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

  const handleToggle = async (next: boolean) => {
    if (!next) {
      const count = await countAssignmentsByOrgAction(orgSlug);
      if (count > 0) {
        setAssignmentCount(count);
        setShowWarning(true);
        return;
      }
    }
    await save(next);
  };

  const plural = assignmentCount !== 1;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TagIcon className="size-5" weight="duotone" />
            Listas de precios configurables
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  Listas por proveedor por cliente
                </p>
                <p className="text-muted-foreground text-sm">
                  Permite asignar listas de precios de compra y venta
                  específicas por proveedor para cada cliente.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={isLoading || isSaving}
                onCheckedChange={(v) => {
                  handleToggle(v);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog onOpenChange={setShowWarning} open={showWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Deshabilitar listas configurables?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tenés {assignmentCount} asignación{plural ? "es" : ""} configurada
              {plural ? "s" : ""}. Al deshabilitar, los precios volverán al
              comportamiento por defecto. Los datos no se borran — podés
              re-habilitar cuando quieras y todo seguirá igual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowWarning(false);
                save(false);
              }}
            >
              Sí, deshabilitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
