"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";

export function InvoicePrintSettings({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    getOrganizationSettings(orgSlug)
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.success && result.data) {
          setEnabled(result.data.invoice_print_duplicate);
        } else {
          setLoadError(
            result.error ?? "No se pudo cargar la configuración de impresión."
          );
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoadError("No se pudo cargar la configuración de impresión.");
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [orgSlug]);

  async function save() {
    setIsSaving(true);
    try {
      const result = await updateOrganizationSettings(orgSlug, {
        invoice_print_duplicate: enabled,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo guardar la configuración.");
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["org", orgSlug, "settings"],
      });
      toast.success("Configuración de impresión guardada");
    } catch {
      toast.error("No se pudo guardar la configuración.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impresión de facturas</CardTitle>
        <CardDescription>
          Elegí las copias que se incluyen en el PDF de las facturas fiscales de
          esta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-20 animate-pulse rounded-md bg-muted" />
        ) : (
          <>
            {loadError ? (
              <p className="text-destructive text-sm">{loadError}</p>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="invoice-print-duplicate">
                  Original y duplicado en el mismo PDF
                </Label>
                <p className="text-muted-foreground text-sm">
                  Incluye primero el original completo y luego el duplicado
                  completo, en páginas separadas. Al desactivarlo, se genera
                  solo el original.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={isSaving || Boolean(loadError)}
                id="invoice-print-duplicate"
                onCheckedChange={setEnabled}
              />
            </div>
            <Button disabled={isSaving || Boolean(loadError)} onClick={save}>
              {isSaving ? "Guardando..." : "Guardar configuración de impresión"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
