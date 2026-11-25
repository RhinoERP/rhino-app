"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { updateOrganizationSettings } from "@/modules/organizations/actions/update-organization-settings.action";
import { updateRemittanceSettings } from "@/modules/organizations/actions/update-remittance-settings.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";

const formSchema = z.object({
  autoEnabled: z.boolean(),
  prefix: z
    .string()
    .max(10, "Máximo 10 caracteres")
    .regex(/^[a-zA-Z0-9]*$/, "Solo letras y números"),
  startingNumber: z.number().int().min(0),
  singlePageDuplicate: z.boolean(),
  remittanceFinalShowSku: z.boolean(),
  remittanceFinalShowWeight: z.boolean(),
  remittanceFinalShowUnitPrice: z.boolean(),
  remittanceFinalShowDiscount: z.boolean(),
  remittanceFinalShowLineTotal: z.boolean(),
  remittanceFinalShowTotal: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const finalRemittanceFields = [
  {
    name: "remittanceFinalShowSku",
    label: "SKU",
    description: "Muestra el código del producto en cada ítem.",
  },
  {
    name: "remittanceFinalShowWeight",
    label: "Peso",
    description: "Muestra la columna de peso cuando el ítem lo tenga.",
  },
  {
    name: "remittanceFinalShowUnitPrice",
    label: "Precio unitario",
    description: "Muestra el precio unitario y los precios de adicionales.",
  },
  {
    name: "remittanceFinalShowDiscount",
    label: "Descuento",
    description: "Muestra el descuento por ítem cuando corresponda.",
  },
  {
    name: "remittanceFinalShowLineTotal",
    label: "Importe por ítem",
    description: "Muestra el importe total de cada renglón.",
  },
  {
    name: "remittanceFinalShowTotal",
    label: "Total del remito",
    description: "Muestra el total numérico y su importe en letras.",
  },
] as const;

function formatPreview(prefix: string, lastNumber: number): string {
  const next = lastNumber + 1;
  const padded = String(next).padStart(5, "0");
  return prefix ? `${prefix}-${padded}` : padded;
}

function buildFormDefaults(
  remittance: {
    success: boolean;
    data?: { autoEnabled: boolean; prefix: string; lastNumber: number } | null;
  },
  orgSettings: {
    success: boolean;
    data?: {
      remittance_single_page_duplicate: boolean;
      remittance_final_show_sku: boolean;
      remittance_final_show_weight: boolean;
      remittance_final_show_unit_price: boolean;
      remittance_final_show_discount: boolean;
      remittance_final_show_line_total: boolean;
      remittance_final_show_total: boolean;
    } | null;
  }
): FormValues {
  const r = remittance.success ? remittance.data : null;
  const s = orgSettings.success ? orgSettings.data : null;
  return {
    autoEnabled: r?.autoEnabled ?? false,
    prefix: r?.prefix ?? "",
    startingNumber: r?.lastNumber ?? 0,
    singlePageDuplicate: s?.remittance_single_page_duplicate ?? false,
    remittanceFinalShowSku: s?.remittance_final_show_sku ?? false,
    remittanceFinalShowWeight: s?.remittance_final_show_weight ?? false,
    remittanceFinalShowUnitPrice: s?.remittance_final_show_unit_price ?? false,
    remittanceFinalShowDiscount: s?.remittance_final_show_discount ?? false,
    remittanceFinalShowLineTotal: s?.remittance_final_show_line_total ?? false,
    remittanceFinalShowTotal: s?.remittance_final_show_total ?? false,
  };
}

type RemittanceSettingsProps = {
  orgSlug: string;
};

export function RemittanceSettings({ orgSlug }: RemittanceSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const { data: liveSettings } = useOrgSettings(orgSlug);
  const fiscalEnabled = liveSettings?.remittance_fiscal_enabled ?? false;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      autoEnabled: false,
      prefix: "",
      startingNumber: 0,
      singlePageDuplicate: false,
      remittanceFinalShowSku: false,
      remittanceFinalShowWeight: false,
      remittanceFinalShowUnitPrice: false,
      remittanceFinalShowDiscount: false,
      remittanceFinalShowLineTotal: false,
      remittanceFinalShowTotal: false,
    },
  });

  const autoEnabled = form.watch("autoEnabled");
  const prefix = form.watch("prefix");
  const startingNumber = form.watch("startingNumber");

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly restarts the initial load without resetting the form on background refreshes.
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError("");
    Promise.all([
      getRemittanceSettings(orgSlug),
      getOrganizationSettings(orgSlug),
    ])
      .then(([remittance, orgSettings]) => {
        if (
          !(
            remittance.success &&
            remittance.data &&
            orgSettings.success &&
            orgSettings.data
          )
        ) {
          throw new Error("No se pudo cargar la configuración de remitos.");
        }
        if (active) {
          form.reset(buildFormDefaults(remittance, orgSettings));
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(
            "No se pudo cargar la configuración de remitos. Reintentá antes de modificarla."
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [orgSlug, form, loadVersion]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    try {
      const [remittanceResult, orgSettingsResult] = await Promise.all([
        updateRemittanceSettings(orgSlug, {
          autoEnabled: values.autoEnabled,
          prefix: values.prefix,
          startingNumber: values.startingNumber,
        }),
        updateOrganizationSettings(orgSlug, {
          remittance_single_page_duplicate: values.singlePageDuplicate,
          remittance_final_show_sku: values.remittanceFinalShowSku,
          remittance_final_show_weight: values.remittanceFinalShowWeight,
          remittance_final_show_unit_price: values.remittanceFinalShowUnitPrice,
          remittance_final_show_discount: values.remittanceFinalShowDiscount,
          remittance_final_show_line_total: values.remittanceFinalShowLineTotal,
          remittance_final_show_total: values.remittanceFinalShowTotal,
        }),
      ]);

      if (remittanceResult.success && orgSettingsResult.success) {
        toast.success("Configuración guardada");
      } else {
        toast.error(
          remittanceResult.error ??
            orgSettingsResult.error ??
            "Error al guardar"
        );
      }
    } catch {
      toast.error(
        "No se pudo guardar la configuración. Revisá la conexión y volvé a intentarlo."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HashIcon className="size-5" weight="duotone" />
          Numeración de Remitos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div
            aria-busy="true"
            className="h-24 animate-pulse rounded-md bg-muted"
          >
            <span className="sr-only">Cargando configuración de remitos…</span>
          </div>
        )}
        {loadError && (
          <div className="space-y-3">
            <p className={CAI_ERROR} role="alert">
              {loadError}
            </p>
            <Button
              onClick={() => setLoadVersion((value) => value + 1)}
              type="button"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        )}
        {!(isLoading || loadError) && (
          <Form {...form}>
            <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
              {fiscalEnabled && (
                <p className="rounded-md border bg-muted/40 p-3 text-sm">
                  La numeración fiscal se administra en Remitos con CAI. El
                  prefijo y contador de esta sección se conservan para la
                  numeración anterior.
                </p>
              )}
              <fieldset className="space-y-5" disabled={fiscalEnabled}>
                <FormField
                  control={form.control}
                  name="autoEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                      <div className="min-w-0">
                        <FormLabel className="text-base">
                          Numeración automática
                        </FormLabel>
                        <FormDescription>
                          El N° de remito se genera automáticamente al despachar
                          una venta
                        </FormDescription>
                      </div>
                      <FormControl className="shrink-0">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {autoEnabled && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <FormField
                      control={form.control}
                      name="prefix"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prefijo</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="w-40 uppercase"
                              onChange={(e) =>
                                field.onChange(e.target.value.toUpperCase())
                              }
                              placeholder="Ej: REM"
                            />
                          </FormControl>
                          <FormDescription>
                            Opcional. Solo letras y números, máx. 10 caracteres.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="startingNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contador actual</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="w-40"
                              min={0}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value)
                                )
                              }
                              type="number"
                              value={field.value}
                            />
                          </FormControl>
                          <FormDescription>
                            El próximo remito usará este número + 1. Ajustalo si
                            ya tenés remitos ingresados manualmente.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="rounded-md bg-muted px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        Próximo remito:{" "}
                      </span>
                      <span className="font-mono font-semibold">
                        {formatPreview(prefix, Number(startingNumber) || 0)}
                      </span>
                    </div>
                  </div>
                )}
              </fieldset>
              <FormField
                control={form.control}
                name="singlePageDuplicate"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <FormLabel className="text-base">
                        Original y duplicado en la misma hoja
                      </FormLabel>
                      <FormDescription>
                        Si el remito ocupa menos de la mitad de la hoja, imprime
                        el original y el duplicado en un solo A4. Solo aplica
                        con hasta 10 ítems.
                      </FormDescription>
                    </div>
                    <FormControl className="shrink-0">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <div>
                  <h3 className="font-medium text-base">
                    Contenido del remito final
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Elegí qué información comercial aparece en los remitos. Los
                    presupuestos siempre muestran sus importes.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {finalRemittanceFields.map((option) => (
                    <FormField
                      control={form.control}
                      key={option.name}
                      name={option.name}
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="min-w-0">
                            <FormLabel>{option.label}</FormLabel>
                            <FormDescription>
                              {option.description}
                            </FormDescription>
                          </div>
                          <FormControl className="shrink-0">
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  className={CAI_PRIMARY_ACTION}
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
