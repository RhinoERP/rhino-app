"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CustomerSite,
  customerSitesSchema,
} from "@/modules/commercial-visits/contracts";

type SiteForm = {
  name: string;
  address: string;
  city: string;
  notes: string;
  active: boolean;
  latitude: string;
  longitude: string;
};
const emptyForm: SiteForm = {
  name: "",
  address: "",
  city: "",
  notes: "",
  active: true,
  latitude: "",
  longitude: "",
};

export function CustomerSitesCard({
  orgSlug,
  customerId,
  canManage,
}: {
  orgSlug: string;
  customerId: string;
  canManage: boolean;
}) {
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<SiteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const url = `/api/org/${encodeURIComponent(orgSlug)}/commercial-visits`;
  const load = useCallback(async () => {
    const response = await fetch(
      `${url}?view=sites&customerId=${encodeURIComponent(customerId)}`,
      { cache: "no-store" }
    );
    const result: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        (result as { error?: string }).error ??
          "No se pudieron cargar sucursales"
      );
    }
    setSites(customerSitesSchema.parse(result));
  }, [url, customerId]);

  useEffect(() => {
    load().catch((error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : "Error de sucursales"
      )
    );
  }, [load]);

  function edit(site: CustomerSite) {
    setEditing(site.id);
    setForm({
      name: site.name,
      address: site.address,
      city: site.city,
      notes: site.notes ?? "",
      active: site.active,
      latitude: site.latitude === null ? "" : String(site.latitude),
      longitude: site.longitude === null ? "" : String(site.longitude),
    });
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: submits validated site fields and reports API errors
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveSite",
          customerId,
          ...(editing && editing !== "new" ? { siteId: editing } : {}),
          ...form,
          latitude: form.latitude.trim() ? Number(form.latitude) : null,
          longitude: form.longitude.trim() ? Number(form.longitude) : null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo guardar la sucursal");
      }
      await load();
      setEditing(null);
      setForm(emptyForm);
      toast.success("Sucursal guardada");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la sucursal"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sucursales y puntos de entrega</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          El administrador carga las sucursales. El vendedor las elige al
          planificar visitas y entregas.
        </p>
        {sites.length === 0 && (
          <p className="text-sm">Todavía no hay sucursales.</p>
        )}
        {sites.map((site) => (
          <div className="rounded-md border p-3 text-sm" key={site.id}>
            <p className="font-medium">
              {site.name}
              {!site.active && " · Inactiva"}
            </p>
            <p>
              {site.address || "Dirección pendiente"}
              {site.city && `, ${site.city}`}
            </p>
            {site.notes && (
              <p className="text-muted-foreground">{site.notes}</p>
            )}
            {site.latitude !== null && (
              <p className="text-muted-foreground">
                Punto aprobado: {site.latitude.toFixed(5)},{" "}
                {site.longitude?.toFixed(5)}
              </p>
            )}
            {canManage && (
              <Button onClick={() => edit(site)} size="sm" variant="outline">
                Editar sucursal
              </Button>
            )}
          </div>
        ))}
        {canManage && (
          <Button
            onClick={() => {
              setEditing("new");
              setForm(emptyForm);
            }}
            variant="outline"
          >
            Agregar sucursal
          </Button>
        )}
        {canManage && editing && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">
              {editing === "new" ? "Nueva sucursal" : "Editar sucursal"}
            </p>
            {(["name", "address", "city", "notes"] as const).map((key) => (
              <label className="block space-y-1 text-sm" key={key}>
                <span>
                  {
                    {
                      name: "Nombre",
                      address: "Dirección",
                      city: "Ciudad",
                      notes: "Indicaciones (opcional)",
                    }[key]
                  }
                </span>
                <input
                  className="w-full rounded-md border p-2"
                  maxLength={
                    { name: 120, address: 500, city: 120, notes: 1000 }[key]
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  value={form[key]}
                />
              </label>
            ))}
            <div className="flex gap-2">
              {(["latitude", "longitude"] as const).map((key) => (
                <label className="w-1/2 space-y-1 text-sm" key={key}>
                  <span>
                    {key === "latitude"
                      ? "Latitud (opcional)"
                      : "Longitud (opcional)"}
                  </span>
                  <input
                    className="w-full rounded-md border p-2"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    step="any"
                    type="number"
                    value={form[key]}
                  />
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={form.active}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
                type="checkbox"
              />{" "}
              Activa
            </label>
            <div className="flex gap-2">
              <Button
                disabled={
                  saving ||
                  !form.name.trim() ||
                  !form.address.trim() ||
                  !form.city.trim() ||
                  Boolean(form.latitude.trim()) !==
                    Boolean(form.longitude.trim())
                }
                onClick={save}
              >
                Guardar sucursal
              </Button>
              <Button onClick={() => setEditing(null)} variant="ghost">
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
