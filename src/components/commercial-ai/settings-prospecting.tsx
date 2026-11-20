"use client";

import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteIcpAction,
  deleteRouteStartAction,
  deleteTerritoryAction,
  saveIcpAction,
  saveRouteSettingsAction,
  saveRouteStartAction,
  saveTerritoryAction,
} from "@/modules/commercial-ai/actions/prospecting.actions";
import { ROUTE_FACTORS } from "@/modules/commercial-ai/constants";
import { isInPlaces } from "@/modules/commercial-ai/engine/routes";
import type {
  IcpView,
  RouteFactor,
  TerritoryView,
} from "@/modules/commercial-ai/types";
import { SellerChip, useCommercialAi } from "./shared";

type Runner = (
  action: () => Promise<{ success: boolean; error?: string }>,
  ok: string,
  after?: () => void
) => void;

function useRunner(): [boolean, Runner] {
  const [pending, startTransition] = useTransition();
  const run: Runner = (action, ok, after) =>
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(ok);
        after?.();
      } else {
        toast.error(result.error);
      }
    });
  return [pending, run];
}

const LIST_SEPARATOR = /[,\n]/;

const splitList = (text: string) =>
  text
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);

/* ============ Rutas: tope, prioridad, partidas, territorios ============ */

export function RouteSettingsSection() {
  const { snapshot } = useCommercialAi();
  const { routeSettings, routeStarts } = snapshot.prospecting;
  const [tope, setTope] = useState(routeSettings.tope);
  const [orden, setOrden] = useState<RouteFactor[]>(routeSettings.orden);
  const [startName, setStartName] = useState("");
  const [startAddress, setStartAddress] = useState("");
  const [startDefault, setStartDefault] = useState(routeStarts.length === 0);
  const [pending, run] = useRunner();

  const move = (index: number, delta: number) =>
    setOrden((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-4">
        <h3 className="font-semibold">Paradas y prioridad</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="route-tope">Hasta</label>
          <Input
            className="w-20 text-right"
            id="route-tope"
            max={25}
            min={1}
            onChange={(e) => setTope(Number(e.target.value) || 1)}
            type="number"
            value={tope}
          />
          paradas por ruta (Google Maps ordena hasta 25).
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-sm">
            Qué pesa más al recomendar a quién visitar:
          </p>
          {orden.map((factor, index) => (
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              key={factor}
            >
              <span className="text-muted-foreground tabular-nums">
                Prioridad {index + 1}
              </span>
              <span className="flex-1 font-medium">
                {ROUTE_FACTORS[factor]}
              </span>
              <Button
                aria-label="Subir"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                size="icon"
                variant="ghost"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                aria-label="Bajar"
                disabled={index === orden.length - 1}
                onClick={() => move(index, 1)}
                size="icon"
                variant="ghost"
              >
                <ArrowDownIcon />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  saveRouteSettingsAction(snapshot.orgSlug, { tope, orden }),
                "Guardado."
              )
            }
          >
            Guardar
          </Button>
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <h3 className="font-semibold">Partidas de la empresa</h3>
          <p className="text-muted-foreground text-sm">
            Desde dónde salen las rutas. La marcada por defecto se propone al
            armar cada ruta.
          </p>
        </div>
        {routeStarts.map((start) => (
          <div
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            key={start.id}
          >
            <span className="font-medium">{start.name}</span>
            <span className="flex-1 text-muted-foreground">
              {start.address}
            </span>
            {start.isDefault ? (
              <Badge variant="secondary">Por defecto</Badge>
            ) : null}
            <Button
              aria-label={`Borrar ${start.name}`}
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteRouteStartAction(snapshot.orgSlug, start.id),
                  "Partida borrada."
                )
              }
              size="icon"
              variant="ghost"
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto_auto]">
          <Input
            aria-label="Nombre de la partida"
            onChange={(e) => setStartName(e.target.value)}
            placeholder="Ej: Depósito"
            value={startName}
          />
          <Input
            aria-label="Dirección de la partida"
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder="Calle y número, localidad"
            value={startAddress}
          />
          <label
            className="flex items-center gap-2 text-sm"
            htmlFor="start-default"
          >
            <Checkbox
              checked={startDefault}
              id="start-default"
              onCheckedChange={(v) => setStartDefault(v === true)}
            />
            Por defecto
          </label>
          <Button
            disabled={pending || !startName.trim() || !startAddress.trim()}
            onClick={() =>
              run(
                () =>
                  saveRouteStartAction(snapshot.orgSlug, {
                    name: startName,
                    address: startAddress,
                    isDefault: startDefault,
                  }),
                "Partida agregada.",
                () => {
                  setStartName("");
                  setStartAddress("");
                }
              )
            }
            variant="outline"
          >
            Agregar partida
          </Button>
        </div>
      </Card>

      <TerritoriesCard />
    </div>
  );
}

function TerritoriesCard() {
  const { snapshot } = useCommercialAi();
  const { territories, prospects } = snapshot.prospecting;
  const [editing, setEditing] = useState<TerritoryView | "nuevo" | null>(null);
  const [pending, run] = useRunner();
  const unassigned = snapshot.customers.filter(
    (c) => !territories.some((t) => isInPlaces(c.city, t.places))
  );

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">Territorios</h3>
          <p className="text-muted-foreground text-sm">
            Las zonas del equipo. Cada cliente cae en el territorio de su
            localidad.
          </p>
        </div>
        <Button onClick={() => setEditing("nuevo")} size="sm" variant="outline">
          Nuevo territorio
        </Button>
      </div>
      {editing ? (
        <TerritoryForm
          onDone={() => setEditing(null)}
          territory={editing === "nuevo" ? null : editing}
        />
      ) : null}
      {territories.map((territory) => {
        const customers = snapshot.customers.filter((c) =>
          isInPlaces(c.city, territory.places)
        ).length;
        const territoryProspects = prospects.filter((p) =>
          isInPlaces(p.city, territory.places)
        ).length;
        return (
          <div
            className="space-y-1 rounded-md border p-3 text-sm"
            key={territory.id}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 font-medium">{territory.name}</span>
              <Button
                onClick={() => setEditing(territory)}
                size="sm"
                variant="ghost"
              >
                Editar
              </Button>
              <Button
                aria-label={`Borrar ${territory.name}`}
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteTerritoryAction(snapshot.orgSlug, territory.id),
                    "Territorio borrado."
                  )
                }
                size="icon"
                variant="ghost"
              >
                <TrashIcon />
              </Button>
            </div>
            <p className="text-muted-foreground">
              {territory.places.join(" · ")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {territory.sellerIds.map((id) => (
                <SellerChip key={id} sellerId={id} />
              ))}
              <span className="text-muted-foreground text-xs">
                {customers} clientes · {territoryProspects} prospectos
              </span>
            </div>
          </div>
        );
      })}
      <p className="text-muted-foreground text-sm">
        Sin zona: {unassigned.length} clientes
        {unassigned.length
          ? ` (${unassigned
              .slice(0, 4)
              .map((c) => c.city || c.name)
              .join(", ")}${unassigned.length > 4 ? "…" : ""})`
          : " · todas las cuentas cayeron en un territorio"}
      </p>
    </Card>
  );
}

function TerritoryForm({
  territory,
  onDone,
}: {
  territory: TerritoryView | null;
  onDone: () => void;
}) {
  const { snapshot } = useCommercialAi();
  const [name, setName] = useState(territory?.name ?? "");
  const [places, setPlaces] = useState(territory?.places.join(", ") ?? "");
  const [sellerIds, setSellerIds] = useState<string[]>(
    territory?.sellerIds ?? []
  );
  const [pending, run] = useRunner();
  const cities = [
    ...new Set(
      snapshot.customers
        .map((c) => c.city)
        .filter((c): c is string => Boolean(c))
    ),
  ].sort();

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <Input
        aria-label="Nombre del territorio"
        onChange={(e) => setName(e.target.value)}
        placeholder="Ej: Gran Resistencia"
        value={name}
      />
      <Input
        aria-label="Localidades"
        list="ia-territory-cities"
        onChange={(e) => setPlaces(e.target.value)}
        placeholder="Localidades separadas por coma: Resistencia, Barranqueras, Fontana"
        value={places}
      />
      <datalist id="ia-territory-cities">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-3 text-sm">
        {snapshot.sellers.map((seller) => (
          <label
            className="flex items-center gap-2"
            htmlFor={`territory-seller-${seller.id}`}
            key={seller.id}
          >
            <Checkbox
              checked={sellerIds.includes(seller.id)}
              id={`territory-seller-${seller.id}`}
              onCheckedChange={(v) =>
                setSellerIds((prev) =>
                  v === true
                    ? [...prev, seller.id]
                    : prev.filter((id) => id !== seller.id)
                )
              }
            />
            {seller.name}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone} variant="ghost">
          Cancelar
        </Button>
        <Button
          disabled={pending || !name.trim() || splitList(places).length === 0}
          onClick={() =>
            run(
              () =>
                saveTerritoryAction(snapshot.orgSlug, {
                  id: territory?.id,
                  name,
                  places: splitList(places),
                  sellerIds,
                }),
              "Territorio guardado.",
              onDone
            )
          }
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}

/* ============ Perfiles de cliente ideal ============ */

export function IcpSection() {
  const { snapshot } = useCommercialAi();
  const { icps, campaigns } = snapshot.prospecting;
  const [editing, setEditing] = useState<IcpView | "nuevo" | null>(null);
  const [pending, run] = useRunner();

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">Perfiles de cliente ideal</h3>
          <p className="text-muted-foreground text-sm">
            A quién le vendés y por qué te compra. Cada campaña elige uno: sus
            rubros se usan para buscar comercios y puntuar el encaje.
          </p>
        </div>
        <Button onClick={() => setEditing("nuevo")} size="sm" variant="outline">
          Nuevo perfil
        </Button>
      </div>
      {editing ? (
        <IcpForm
          icp={editing === "nuevo" ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}
      {icps.map((icp) => (
        <div className="space-y-1 rounded-md border p-3 text-sm" key={icp.id}>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-medium">{icp.name}</span>
            <span className="text-muted-foreground text-xs">
              {campaigns.filter((c) => c.icpId === icp.id).length} campañas
            </span>
            <Button onClick={() => setEditing(icp)} size="sm" variant="ghost">
              Editar
            </Button>
            <Button
              aria-label={`Borrar ${icp.name}`}
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteIcpAction(snapshot.orgSlug, icp.id),
                  "Perfil borrado."
                )
              }
              size="icon"
              variant="ghost"
            >
              <TrashIcon />
            </Button>
          </div>
          {icp.description ? (
            <p className="text-muted-foreground">{icp.description}</p>
          ) : null}
          <p className="text-xs">
            <span className="text-muted-foreground">Rubros:</span>{" "}
            {icp.keywords.join(", ")}
            {icp.personas.length ? (
              <>
                {" "}
                · <span className="text-muted-foreground">Le hablamos a:</span>{" "}
                {icp.personas.join(", ")}
              </>
            ) : null}
          </p>
        </div>
      ))}
      {icps.length === 0 && !editing ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hay perfiles.
        </p>
      ) : null}
    </Card>
  );
}

function IcpForm({ icp, onDone }: { icp: IcpView | null; onDone: () => void }) {
  const { snapshot } = useCommercialAi();
  const [name, setName] = useState(icp?.name ?? "");
  const [description, setDescription] = useState(icp?.description ?? "");
  const [keywords, setKeywords] = useState(icp?.keywords.join(", ") ?? "");
  const [personas, setPersonas] = useState(icp?.personas.join(", ") ?? "");
  const [valueProposition, setValueProposition] = useState(
    icp?.valueProposition ?? ""
  );
  const [pending, run] = useRunner();

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <Input
        aria-label="Nombre del perfil"
        onChange={(e) => setName(e.target.value)}
        placeholder="Ej: Pizzerías y rotiserías"
        value={name}
      />
      <Textarea
        aria-label="Descripción"
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Quiénes son y qué buscan (ej: usan mucha mozzarella y buscan continuidad de entrega)"
        rows={2}
        value={description}
      />
      <Input
        aria-label="Rubros"
        onChange={(e) => setKeywords(e.target.value)}
        placeholder="Rubros para buscar, separados por coma: pizzería, rotisería, casa de pastas"
        value={keywords}
      />
      <Input
        aria-label="Personas"
        onChange={(e) => setPersonas(e.target.value)}
        placeholder="A quién le hablamos: Dueño, Encargado de compras"
        value={personas}
      />
      <Textarea
        aria-label="Propuesta de valor"
        onChange={(e) => setValueProposition(e.target.value)}
        placeholder="Qué le prometemos (va en el mensaje)"
        rows={2}
        value={valueProposition}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone} variant="ghost">
          Cancelar
        </Button>
        <Button
          disabled={pending || !name.trim() || splitList(keywords).length === 0}
          onClick={() =>
            run(
              () =>
                saveIcpAction(snapshot.orgSlug, {
                  id: icp?.id,
                  name,
                  description,
                  keywords: splitList(keywords),
                  personas: splitList(personas),
                  valueProposition,
                }),
              "Perfil guardado.",
              onDone
            )
          }
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}
