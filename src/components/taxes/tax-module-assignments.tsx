"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  type TaxModuleContext,
  toggleTaxModuleAssignmentAction,
} from "@/modules/taxes/actions/import-tax-catalog.action";
import { CATALOG_CATEGORY_LABELS } from "@/modules/taxes/argentina-catalog";
import type { Tax } from "@/modules/taxes/types";

type TaxModuleAssignmentsProps = {
  orgSlug: string;
  taxes: Tax[];
};

type ModuleConfig = {
  context: TaxModuleContext;
  label: string;
  description: string;
  field: keyof Tax;
  color: string;
};

const MODULES: ModuleConfig[] = [
  {
    context: "sales",
    label: "Ventas",
    description: "Impuestos que se aplican al crear o confirmar una venta.",
    field: "is_favorite_sales",
    color: "bg-blue-500/10 border-blue-500/20 dark:bg-blue-500/5",
  },
  {
    context: "direct_sales",
    label: "Venta Directa / POS",
    description: "Impuestos para ventas en el punto de venta directo.",
    field: "is_favorite_direct_sales",
    color: "bg-purple-500/10 border-purple-500/20 dark:bg-purple-500/5",
  },
  {
    context: "credit_notes",
    label: "Notas de Crédito",
    description: "Impuestos/tributos que aplican en notas de crédito.",
    field: "is_favorite_credit_notes",
    color: "bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-500/5",
  },
  {
    context: "debit_notes",
    label: "Notas de Débito",
    description: "Impuestos/tributos que aplican en notas de débito.",
    field: "is_favorite_debit_notes",
    color: "bg-amber-500/10 border-amber-500/20 dark:bg-amber-500/5",
  },
];

function TaxModuleRow({
  tax,
  module,
  orgSlug,
}: {
  tax: Tax;
  module: ModuleConfig;
  orgSlug: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const enabled = Boolean(tax[module.field]);

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      const result = await toggleTaxModuleAssignmentAction(
        orgSlug,
        tax.id,
        module.context,
        checked
      );
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const categoryLabel = tax.catalog_category
    ? (CATALOG_CATEGORY_LABELS[
        tax.catalog_category as keyof typeof CATALOG_CATEGORY_LABELS
      ] ?? tax.catalog_category)
    : null;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-sm">{tax.name}</span>
          <span className="text-muted-foreground text-sm">— {tax.rate}%</span>
          {categoryLabel && (
            <Badge className="text-xs" variant="outline">
              {categoryLabel}
            </Badge>
          )}
        </div>
        {tax.catalog_province && (
          <p className="text-muted-foreground text-xs">
            {tax.catalog_province}
          </p>
        )}
      </div>
      <Switch
        checked={enabled}
        disabled={isPending}
        onCheckedChange={handleToggle}
      />
    </div>
  );
}

export function TaxModuleAssignments({
  orgSlug,
  taxes,
}: TaxModuleAssignmentsProps) {
  const activeTaxes = taxes.filter((t) => t.is_active !== false);

  if (activeTaxes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">
          No hay impuestos activos. Importá el catálogo argentino o creá un
          impuesto para asignarlo a los módulos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-base">Asignación por módulo</h2>
        <p className="text-muted-foreground text-sm">
          Activá los impuestos que deben preseleccionarse en cada tipo de
          documento. Podés activar el mismo impuesto en varios módulos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {MODULES.map((mod) => {
          const assignedCount = activeTaxes.filter((t) =>
            Boolean(t[mod.field])
          ).length;

          return (
            <Card className={`border ${mod.color}`} key={mod.context}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{mod.label}</CardTitle>
                  {assignedCount > 0 && (
                    <Badge className="text-xs" variant="secondary">
                      {assignedCount} asignado{assignedCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {mod.description}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                {activeTaxes.length === 0 ? (
                  <p className="py-2 text-muted-foreground text-xs">
                    Sin impuestos disponibles.
                  </p>
                ) : (
                  <div className="divide-y">
                    {activeTaxes.map((tax) => (
                      <TaxModuleRow
                        key={tax.id}
                        module={mod}
                        orgSlug={orgSlug}
                        tax={tax}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
