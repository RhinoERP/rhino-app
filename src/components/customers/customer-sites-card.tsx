"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CustomerSite,
  customerSitesSchema,
  type SiteProposal,
  siteProposalsSchema,
} from "@/modules/commercial-visits/contracts";
import { resolveSiteFormMode } from "@/modules/commercial-visits/site-form-mode";
import { type MapPosition, SiteLocationPreview } from "./site-location-preview";

type Candidate = MapPosition & {
  label: string;
  exactNumber: boolean;
};

type SiteForm = {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  notes: string;
  active: boolean;
  latitude: string;
  longitude: string;
};
const emptyForm: SiteForm = {
  name: "",
  address: "",
  city: "",
  postalCode: "",
  notes: "",
  active: true,
  latitude: "",
  longitude: "",
};

async function requestCandidates(
  url: string,
  customerId: string,
  form: SiteForm
): Promise<Candidate[]> {
  const response = await fetch(`${url}/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId,
      address: form.address.trim(),
      city: form.city.trim(),
      postalCode: form.postalCode.trim(),
    }),
  });
  const result = (await response.json()) as {
    error?: string;
    candidates?: Candidate[];
  };
  if (!response.ok) {
    throw new Error(result.error ?? "No se pudo buscar la dirección");
  }
  return result.candidates ?? [];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: renders the same site form with separate admin-save and proposal-only permissions
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
  const [proposals, setProposals] = useState<SiteProposal[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [proposalMode, setProposalMode] = useState(false);
  const [form, setForm] = useState<SiteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draftPoint, setDraftPoint] = useState<MapPosition | null>(null);
  const [pointConfirmed, setPointConfirmed] = useState(true);
  const searchSequence = useRef(0);
  const url = `/api/org/${encodeURIComponent(orgSlug)}/commercial-visits`;
  const action = resolveSiteFormMode(canManage, proposalMode);
  const savingDirectly = action === "saveSite";
  const formTitle = {
    admin: { new: "Nueva sucursal", edit: "Editar sucursal" },
    seller: {
      new: "Nueva propuesta de sucursal",
      edit: "Proponer cambio de sucursal",
    },
  }[savingDirectly ? "admin" : "seller"][editing === "new" ? "new" : "edit"];
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
  const loadProposals = useCallback(async () => {
    const response = await fetch(
      `${url}?view=siteProposals&customerId=${encodeURIComponent(customerId)}`,
      { cache: "no-store" }
    );
    const result: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        (result as { error?: string }).error ??
          "No se pudieron cargar las propuestas"
      );
    }
    setProposals(siteProposalsSchema.parse(result));
  }, [url, customerId]);

  useEffect(() => {
    load().catch((error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : "Error de sucursales"
      )
    );
    loadProposals().catch((error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : "Error al cargar propuestas"
      )
    );
  }, [load, loadProposals]);

  function edit(site: CustomerSite, asProposal = false) {
    const direct = canManage && !asProposal;
    setProposalMode(!direct);
    setEditing(site.id);
    setForm({
      name: site.name,
      address: site.address,
      city: site.city,
      postalCode: site.postalCode ?? "",
      notes: site.notes ?? "",
      active: site.active,
      latitude: !direct || site.latitude === null ? "" : String(site.latitude),
      longitude:
        !direct || site.longitude === null ? "" : String(site.longitude),
    });
    resetSearch();
    setPointConfirmed(direct);
  }

  function resetSearch() {
    searchSequence.current += 1;
    setSearching(false);
    setCandidates([]);
    setSelected(null);
    setDraftPoint(null);
  }

  // An explicit search only: no address or customer data is sent while typing.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ignores stale requests and reports provider errors without modifying approved points
  async function searchAddress() {
    resetSearch();
    setSearching(true);
    const sequence = searchSequence.current;
    try {
      const results = await requestCandidates(url, customerId, form);
      if (sequence !== searchSequence.current) {
        return;
      }
      setCandidates(results);
      if (results.length === 0) {
        toast.error(
          "No encontramos esa dirección. Revisá los datos o ubicá el punto manualmente."
        );
      }
    } catch (error) {
      if (sequence === searchSequence.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo buscar la dirección"
        );
      }
    } finally {
      if (sequence === searchSequence.current) {
        setSearching(false);
      }
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: submits validated site fields and reports API errors
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
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
      await loadProposals();
      setEditing(null);
      setForm(emptyForm);
      resetSearch();
      toast.success(
        savingDirectly
          ? "Sucursal guardada"
          : "Propuesta enviada al administrador para aprobación"
      );
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
          Podés proponer una sucursal o punto desde acá. Hasta que el
          administrador lo apruebe, no aparecerá en el mapa de visitas.
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
              {site.postalCode && ` · CP ${site.postalCode}`}
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
            {site.latitude === null && (
              <p className="text-amber-700">
                Sin punto aprobado: no aparece en el mapa de visitas.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button onClick={() => edit(site)} size="sm" variant="outline">
                  Editar sucursal
                </Button>
              )}
              <Button
                onClick={() => edit(site, true)}
                size="sm"
                variant="outline"
              >
                Proponer punto o cambio
              </Button>
            </div>
          </div>
        ))}
        {proposals.map((proposal) => (
          <div
            className="rounded-md border border-amber-500/50 p-3 text-sm"
            key={proposal.id}
          >
            <p className="font-medium">
              {proposal.name} · Pendiente de aprobación
            </p>
            <p>
              {proposal.address}, {proposal.city}
              {proposal.postalCode && ` · CP ${proposal.postalCode}`}
            </p>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button
              onClick={() => {
                setProposalMode(false);
                setEditing("new");
                setForm(emptyForm);
                resetSearch();
                setPointConfirmed(true);
              }}
              variant="outline"
            >
              Agregar sucursal
            </Button>
          )}
          <Button
            onClick={() => {
              setProposalMode(true);
              setEditing("new");
              setForm(emptyForm);
              resetSearch();
              setPointConfirmed(false);
            }}
            variant="outline"
          >
            Proponer sucursal y punto
          </Button>
        </div>
        {editing && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">{formTitle}</p>
            {!savingDirectly && (
              <p className="text-muted-foreground text-xs">
                La sucursal y el punto no se incorporan hasta que un
                administrador los apruebe.
              </p>
            )}
            {(
              [
                "name",
                "address",
                "city",
                "postalCode",
                ...(savingDirectly ? (["notes"] as const) : []),
              ] as const
            ).map((key) => (
              <label className="block space-y-1 text-sm" key={key}>
                <span>
                  {
                    {
                      name: "Nombre",
                      address: "Dirección",
                      city: "Ciudad",
                      postalCode: "Código postal (opcional)",
                      notes: "Indicaciones (opcional)",
                    }[key]
                  }
                </span>
                <input
                  className="w-full rounded-md border p-2"
                  maxLength={
                    {
                      name: 120,
                      address: 500,
                      city: 120,
                      postalCode: 16,
                      notes: 1000,
                    }[key]
                  }
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }));
                    if (
                      key === "address" ||
                      key === "city" ||
                      key === "postalCode"
                    ) {
                      resetSearch();
                      setPointConfirmed(false);
                    }
                  }}
                  value={form[key]}
                />
              </label>
            ))}
            <p className="text-muted-foreground text-xs">
              Ingresá calle y número en Dirección. La búsqueda se realiza sólo
              cuando tocás el botón y envía esa dirección a Geoapify.
            </p>
            <Button
              disabled={
                searching || saving || !form.address.trim() || !form.city.trim()
              }
              loading={searching}
              loadingText="Buscando dirección…"
              onClick={searchAddress}
              type="button"
              variant="outline"
            >
              Buscar dirección en mapa
            </Button>
            {candidates.length > 0 && (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">Elegí y verificá un resultado</p>
                {candidates.map((candidate, index) => (
                  <Button
                    className="h-auto w-full justify-start whitespace-normal text-left"
                    key={`${candidate.latitude}-${candidate.longitude}-${index}`}
                    onClick={() => {
                      setSelected(index);
                      setDraftPoint({
                        latitude: candidate.latitude,
                        longitude: candidate.longitude,
                      });
                    }}
                    type="button"
                    variant={selected === index ? "default" : "outline"}
                  >
                    {candidate.label}
                    {!candidate.exactNumber && " · Número no confirmado"}
                  </Button>
                ))}
                {selected !== null && draftPoint && (
                  <>
                    <p className="text-muted-foreground text-xs">
                      Verificá que el marcador esté en la puerta del local.
                      Podés tocar el mapa o arrastrarlo para corregirlo.
                    </p>
                    <SiteLocationPreview
                      initial={candidates[selected]}
                      key={selected}
                      onChange={setDraftPoint}
                    />
                    <Button
                      onClick={() => {
                        setForm((current) => ({
                          ...current,
                          latitude: String(draftPoint.latitude),
                          longitude: String(draftPoint.longitude),
                        }));
                        setPointConfirmed(true);
                        resetSearch();
                        toast.success(
                          savingDirectly
                            ? "Punto listo. Guardá la sucursal para aprobarlo."
                            : "Punto listo. Enviá la propuesta al administrador."
                        );
                      }}
                      type="button"
                    >
                      Confirmar este punto
                    </Button>
                  </>
                )}
                <a
                  className="block text-primary text-xs underline"
                  href="https://www.geoapify.com/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Búsqueda de direcciones: Geoapify
                </a>
              </div>
            )}
            {form.latitude.trim() && !pointConfirmed && (
              <div className="space-y-2 text-amber-700 text-sm">
                <p>
                  Cambiaste la dirección: confirmá un punto nuevo antes de
                  continuar.
                </p>
                {savingDirectly && (
                  <Button
                    onClick={() => setPointConfirmed(true)}
                    type="button"
                    variant="outline"
                  >
                    Mantener el punto actual
                  </Button>
                )}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer">
                Coordenadas manuales (opcional)
              </summary>
              <div className="mt-2 flex gap-2">
                {(["latitude", "longitude"] as const).map((key) => (
                  <label className="w-1/2 space-y-1 text-sm" key={key}>
                    <span>
                      {key === "latitude"
                        ? "Latitud (opcional)"
                        : "Longitud (opcional)"}
                    </span>
                    <input
                      className="w-full rounded-md border p-2"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }));
                        setPointConfirmed(true);
                      }}
                      step="any"
                      type="number"
                      value={form[key]}
                    />
                  </label>
                ))}
              </div>
            </details>
            {savingDirectly && (
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
            )}
            <div className="flex gap-2">
              <Button
                disabled={
                  saving ||
                  searching ||
                  !form.name.trim() ||
                  !form.address.trim() ||
                  !form.city.trim() ||
                  Boolean(form.latitude.trim()) !==
                    Boolean(form.longitude.trim()) ||
                  (Boolean(form.latitude.trim()) && !pointConfirmed) ||
                  !(savingDirectly || form.latitude.trim())
                }
                onClick={save}
              >
                {savingDirectly ? "Guardar sucursal" : "Enviar a aprobación"}
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
