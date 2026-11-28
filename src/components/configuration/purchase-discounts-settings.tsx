"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateOrgSettingsAction } from "@/modules/organizations/actions/update-org-settings.action";

export function PurchaseDiscountsSettings({
  orgSlug,
  enabled,
  includeTaxes,
}: {
  orgSlug: string;
  enabled: boolean;
  includeTaxes: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (patch: {
    purchase_discounts_enabled?: boolean;
    post_invoice_discounts_include_taxes?: boolean;
  }) => {
    startTransition(async () => {
      const result = await updateOrgSettingsAction(orgSlug, patch);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
      await queryClient.invalidateQueries({
        queryKey: ["products", "by-supplier", orgSlug],
      });
      router.refresh();
      toast.success("Configuración guardada");
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Descuentos de compra</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="purchase-discounts-enabled">
              Descuentos desglosados
            </Label>
            <p className="text-muted-foreground text-sm">
              Cinco descuentos habituales en las listas de proveedores y tres
              descuentos post factura por línea de compra.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={pending}
            id="purchase-discounts-enabled"
            onCheckedChange={(value) =>
              save({ purchase_discounts_enabled: value })
            }
          />
        </div>
        {enabled && (
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="post-invoice-include-taxes">
                Calcular descuentos post factura con impuestos
              </Label>
              <p className="text-muted-foreground text-sm">
                Aplica a las nuevas líneas. Apagado: base neta sin impuestos.
                Los descuentos habituales siempre son preimpuestos; los post
                factura solo afectan el costo operativo.
              </p>
            </div>
            <Switch
              checked={includeTaxes}
              disabled={pending}
              id="post-invoice-include-taxes"
              onCheckedChange={(value) =>
                save({ post_invoice_discounts_include_taxes: value })
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
