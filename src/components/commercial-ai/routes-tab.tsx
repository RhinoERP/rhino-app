"use client";

import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createRouteAction,
  deleteRouteAction,
  recordStopResultAction,
} from "@/modules/commercial-ai/actions/prospecting.actions";
import { VISIT_RESULTS } from "@/modules/commercial-ai/constants";
import {
  googleMapsRouteUrl,
  recommendStops,
  routeStats,
  routeStatus,
  type StopCandidate,
} from "@/modules/commercial-ai/engine/routes";
import type { RouteView, VisitResult } from "@/modules/commercial-ai/types";
import { CheckinLocationLine, CheckinsView } from "./checkins-view";
import { EmptyRow, SectionCard, SellerChip, useCommercialAi } from "./shared";
import { VisitResultPicker } from "./visit-location";

const MS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;
const QUICK_DAYS = 6;
const SATURDAY = 6;
const SUNDAY = 0;

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function mondayOf(iso: string): string {
  return addDays(iso, -((weekday(iso) + SATURDAY) % DAYS_IN_WEEK));
}

function weekLabel(offset: number): string {
  if (offset === 0) {
    return "Esta semana";
  }
  return offset === 1 ? "Semana que viene" : "Semana";
}

function stopBadgeClass(result: VisitResult | null): string {
  if (result === "nofue") {
    return "border-destructive bg-destructive text-white";
  }
  return result
    ? "border-emerald-600 bg-emerald-600 text-white"
    : "border-primary";
}

function shortDay(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/* ============ Pestaña ============ */

export function RoutesTab() {
  const [mode, setMode] = useState<
    | { view: "lista" }
    | { view: "nueva" }
    | { view: "registros" }
    | { view: "ruta"; id: string }
  >({
    view: "lista",
  });

  if (mode.view === "registros") {
    return <CheckinsView onBack={() => setMode({ view: "lista" })} />;
  }

  if (mode.view === "nueva") {
    return (
      <RouteBuilder
        onDone={(id) => setMode(id ? { view: "ruta", id } : { view: "lista" })}
      />
    );
  }
  if (mode.view === "ruta") {
    return (
      <RouteDetail
        onBack={() => setMode({ view: "lista" })}
        routeId={mode.id}
      />
    );
  }
  return (
    <RoutesWeek
      onCheckins={() => setMode({ view: "registros" })}
      onNew={() => setMode({ view: "nueva" })}
      onOpen={(id) => setMode({ view: "ruta", id })}
    />
  );
}

function RoutesWeek({
  onNew,
  onOpen,
  onCheckins,
}: {
  onNew: () => void;
  onOpen: (id: string) => void;
  onCheckins: () => void;
}) {
  const { snapshot, isManager } = useCommercialAi();
  const { routes } = snapshot.prospecting;
  const [weekOffset, setWeekOffset] = useState(0);
  const start = addDays(mondayOf(snapshot.today), weekOffset * DAYS_IN_WEEK);
  const end = addDays(start, DAYS_IN_WEEK - 1);
  const weekRoutes = routes
    .filter((r) => r.date >= start && r.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totals = weekRoutes.reduce(
    (acc, route) => {
      const stats = routeStats(route, snapshot.today);
      acc.planned += stats.planned;
      acc.done += stats.done;
      acc.unregistered += stats.unregistered;
      acc.orders += stats.orders;
      acc.followUps += stats.followUps;
      acc.prospects += stats.prospectsVisited;
      if (route.date <= snapshot.today) {
        acc.duePlanned += stats.planned;
      }
      return acc;
    },
    {
      planned: 0,
      done: 0,
      unregistered: 0,
      orders: 0,
      followUps: 0,
      prospects: 0,
      duePlanned: 0,
    }
  );

  const sellerRows = snapshot.sellers.map((seller) => {
    const mine = weekRoutes.filter((r) => r.sellerId === seller.id);
    const stats = mine.map((r) => routeStats(r, snapshot.today));
    const sum = (key: keyof ReturnType<typeof routeStats>) =>
      stats.reduce((acc, s) => acc + s[key], 0);
    const due = mine
      .filter((r) => r.date <= snapshot.today)
      .reduce((acc, r) => acc + r.stops.length, 0);
    return {
      seller,
      routes: mine.length,
      planned: sum("planned"),
      done: sum("done"),
      unregistered: sum("unregistered"),
      orders: sum("orders"),
      followUps: sum("followUps"),
      prospects: sum("prospectsVisited"),
      due,
    };
  });

  const kpis = [
    ["Rutas", weekRoutes.length],
    ["Paradas planificadas", totals.planned],
    ["Hechas", totals.done],
    ["Sin registrar", totals.unregistered],
    [
      "Cumplimiento",
      totals.duePlanned
        ? `${Math.round((totals.done / totals.duePlanned) * 100)} %`
        : "—",
    ],
    ["Pedidos", totals.orders],
    ["Seguimientos", totals.followUps],
    ["Prospectos visitados", totals.prospects],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label="Semana anterior"
          onClick={() => setWeekOffset((w) => w - 1)}
          size="icon"
          variant="outline"
        >
          <CaretLeftIcon />
        </Button>
        <span className="font-medium text-sm">
          {weekLabel(weekOffset)} · {shortDay(start)} – {shortDay(end)}
        </span>
        <Button
          aria-label="Semana siguiente"
          onClick={() => setWeekOffset((w) => w + 1)}
          size="icon"
          variant="outline"
        >
          <CaretRightIcon />
        </Button>
        <Button className="ml-auto" onClick={onCheckins} variant="outline">
          <MapPinIcon />
          {isManager ? "Registros con ubicación" : "Mis registros"}
        </Button>
        <Button onClick={onNew}>
          <PlusIcon />
          Armar ruta
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([label, value]) => (
          <Card className="gap-1 p-3" key={label}>
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-heading text-2xl tabular-nums">{value}</span>
          </Card>
        ))}
      </div>

      {isManager && snapshot.sellers.length ? (
        <SectionCard title="Por vendedor">
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Rutas</TableHead>
                  <TableHead className="text-right">Planificadas</TableHead>
                  <TableHead className="text-right">Hechas</TableHead>
                  <TableHead className="text-right">Sin registrar</TableHead>
                  <TableHead className="text-right">Cumplimiento</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Seguimientos</TableHead>
                  <TableHead className="text-right">Prospectos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellerRows.map((row) => (
                  <TableRow key={row.seller.id}>
                    <TableCell>
                      <SellerChip sellerId={row.seller.id} />
                      {row.routes === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          Sin rutas esta semana
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.routes}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.planned}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.done}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.unregistered}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.due
                        ? `${Math.round((row.done / row.due) * 100)} %`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.orders}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.followUps}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.prospects}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Rutas de la semana">
        {weekRoutes.length ? (
          weekRoutes.map((route) => {
            const stats = routeStats(route, snapshot.today);
            const status = routeStatus(route, snapshot.today);
            return (
              <button
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-left hover:bg-muted/50"
                key={route.id}
                onClick={() => onOpen(route.id)}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium capitalize">
                    {shortDay(route.date)}
                  </span>
                  {route.places.length ? (
                    <span className="text-muted-foreground text-xs">
                      · {route.places.join(", ")}
                    </span>
                  ) : null}
                  {isManager ? <SellerChip sellerId={route.sellerId} /> : null}
                </div>
                <div className="row-span-2 flex flex-col items-end gap-1">
                  <Badge
                    variant={status === "Terminada" ? "default" : "secondary"}
                  >
                    {status}
                  </Badge>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {stats.done} de {stats.planned} hechas
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {route.stops.length} paradas
                  {route.createdByName
                    ? ` · armada por ${route.createdByName}`
                    : ""}
                </p>
              </button>
            );
          })
        ) : (
          <EmptyRow>
            Nadie tiene rutas esta semana. Tocá “Armar ruta” para recomendar a
            quién visitar.
          </EmptyRow>
        )}
      </SectionCard>
    </div>
  );
}

/* ============ Armar ruta ============ */

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: asistente de dos pasos con su estado en un solo lugar
function RouteBuilder({ onDone }: { onDone: (routeId?: string) => void }) {
  const { snapshot, isManager } = useCommercialAi();
  const { territories, routeStarts, routeSettings, routes, prospects } =
    snapshot.prospecting;
  const [step, setStep] = useState<1 | 2>(1);
  const [sellerId, setSellerId] = useState<string>(
    isManager ? "" : snapshot.currentUserId
  );
  const [date, setDate] = useState(snapshot.today);
  const [zoneMode, setZoneMode] = useState<"territorio" | "barrios">(
    territories.length ? "territorio" : "barrios"
  );
  const [territoryId, setTerritoryId] = useState<string>("");
  const [placesText, setPlacesText] = useState("");
  const defaultStart = routeStarts.find((s) => s.isDefault);
  const [startChoice, setStartChoice] = useState<string>(
    defaultStart?.id ?? "primera"
  );
  const [otherStart, setOtherStart] = useState("");
  const [selected, setSelected] = useState<StopCandidate[]>([]);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const quickDays = useMemo(() => {
    const days: string[] = [];
    for (let offset = 0; days.length < QUICK_DAYS; offset += 1) {
      const day = addDays(snapshot.today, offset);
      if (weekday(day) !== SUNDAY) {
        days.push(day);
      }
    }
    return days;
  }, [snapshot.today]);

  const knownCities = useMemo(
    () =>
      [
        ...new Set(
          snapshot.customers
            .map((c) => c.city)
            .filter((c): c is string => Boolean(c))
        ),
      ].sort(),
    [snapshot.customers]
  );

  const territory = territories.find((t) => t.id === territoryId) ?? null;
  const places = useMemo(
    () =>
      zoneMode === "territorio"
        ? (territory?.places ?? [])
        : placesText
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
    [zoneMode, territory, placesText]
  );
  const sellerTerritories = territories.filter(
    (t) => !sellerId || t.sellerIds.includes(sellerId)
  );
  const otherTerritories = territories.filter(
    (t) => sellerId && !t.sellerIds.includes(sellerId)
  );

  const busy = useMemo(() => {
    const ids = new Set<string>();
    for (const route of routes) {
      if (route.date === date) {
        for (const stop of route.stops) {
          ids.add(stop.accountId);
        }
      }
    }
    return ids;
  }, [routes, date]);

  const recommendation = useMemo(
    () =>
      recommendStops({
        date,
        sellerId: sellerId || null,
        places,
        settings: routeSettings,
        customers: snapshot.customers,
        opportunities: snapshot.opportunities,
        tasks: snapshot.tasks,
        prospects,
        routes,
        busyAccountIds: busy,
      }),
    [
      date,
      sellerId,
      places,
      routeSettings,
      snapshot.customers,
      snapshot.opportunities,
      snapshot.tasks,
      prospects,
      routes,
      busy,
    ]
  );

  const goToStep2 = () => {
    if (!sellerId) {
      toast.error("Elegí el vendedor.");
      return;
    }
    setSelected(recommendation.selected);
    setStep(2);
  };

  const selectedIds = new Set(selected.map((s) => s.id));
  const universe = [...recommendation.selected, ...recommendation.rest];
  const searchResults = search.trim()
    ? universe
        .filter(
          (c) =>
            !selectedIds.has(c.id) &&
            c.name.toLowerCase().includes(search.trim().toLowerCase())
        )
        .slice(0, 8)
    : [];
  const leftOut = universe.filter((c) => !selectedIds.has(c.id));
  const atLimit = selected.length >= routeSettings.tope;

  let startLabel: string | null = null;
  if (startChoice === "otra") {
    startLabel = otherStart.trim() || null;
  } else if (startChoice !== "primera") {
    startLabel = routeStarts.find((s) => s.id === startChoice)?.address ?? null;
  }

  const save = () =>
    startTransition(async () => {
      const result = await createRouteAction(snapshot.orgSlug, {
        sellerId,
        date,
        territoryId: zoneMode === "territorio" ? territoryId || null : null,
        places,
        startLabel,
        stops: selected.map((s) => ({
          kind: s.kind,
          id: s.id,
          reason: s.reason,
        })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const seller = snapshot.sellers.find((s) => s.id === sellerId);
      toast.success(
        sellerId === snapshot.currentUserId
          ? "Ruta guardada."
          : `Ruta asignada a ${seller?.shortName ?? "el vendedor"}.`
      );
      onDone(result.id);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          aria-label="Volver"
          onClick={() => onDone()}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="font-heading text-xl">Armar ruta</h2>
        <span className="ml-auto text-muted-foreground text-sm">
          Paso {step} de 2 · {step === 1 ? "Día y zona" : "A quién visitar"}
        </span>
      </div>

      {step === 1 ? (
        <Card className="gap-0 divide-y p-0">
          {isManager ? (
            <Row
              hint="Queda asignada al vendedor y la puede editar."
              label="Para quién"
            >
              <Select onValueChange={setSellerId} value={sellerId}>
                <SelectTrigger aria-label="Vendedor" className="w-full">
                  <SelectValue placeholder="Elegí el vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                  {snapshot.sellers.some(
                    (s) => s.id === snapshot.currentUserId
                  ) ? null : (
                    <SelectItem value={snapshot.currentUserId}>Vos</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Row>
          ) : null}
          <Row label="Día">
            <div className="flex flex-wrap gap-2">
              {quickDays.map((day) => (
                <button
                  aria-pressed={date === day}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm capitalize",
                    date === day
                      ? "border-primary bg-primary/10 font-medium"
                      : "hover:bg-muted"
                  )}
                  key={day}
                  onClick={() => setDate(day)}
                  type="button"
                >
                  {day === snapshot.today
                    ? `hoy · ${shortDay(day)}`
                    : shortDay(day)}
                </button>
              ))}
              <Input
                aria-label="Otro día"
                className="w-40"
                min={snapshot.today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                type="date"
                value={quickDays.includes(date) ? "" : date}
              />
            </div>
          </Row>
          <Row label="Zona">
            <div className="space-y-2">
              <div className="inline-flex rounded-full border p-0.5 text-sm">
                {(["territorio", "barrios"] as const).map((mode) => (
                  <button
                    aria-pressed={zoneMode === mode}
                    className={cn(
                      "rounded-full px-3 py-1",
                      zoneMode === mode ? "bg-muted font-medium" : ""
                    )}
                    key={mode}
                    onClick={() => setZoneMode(mode)}
                    type="button"
                  >
                    {mode === "territorio"
                      ? "Un territorio"
                      : "Localidades sueltas"}
                  </button>
                ))}
              </div>
              {zoneMode === "territorio" && territories.length > 0 ? (
                <Select onValueChange={setTerritoryId} value={territoryId}>
                  <SelectTrigger aria-label="Territorio" className="w-full">
                    <SelectValue placeholder="Elegí un territorio" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...sellerTerritories, ...otherTerritories].map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {t.places.join(", ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {zoneMode === "territorio" && territories.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Todavía no hay territorios. El gerente los arma en
                  Configuración → Rutas.
                </p>
              ) : null}
              {zoneMode === "barrios" ? (
                <>
                  <Input
                    aria-label="Localidades"
                    list="ia-cities"
                    onChange={(e) => setPlacesText(e.target.value)}
                    placeholder="Ej: Resistencia, Fontana (vacío = toda la cartera)"
                    value={placesText}
                  />
                  <datalist id="ia-cities">
                    {knownCities.map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </>
              ) : null}
            </div>
          </Row>
          <Row label="Punto de partida">
            <div className="space-y-2">
              <Select onValueChange={setStartChoice} value={startChoice}>
                <SelectTrigger aria-label="Partida" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primera">
                    La primera parada (la de más prioridad)
                  </SelectItem>
                  {routeStarts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.address}
                    </SelectItem>
                  ))}
                  <SelectItem value="otra">Otra dirección</SelectItem>
                </SelectContent>
              </Select>
              {startChoice === "otra" ? (
                <Input
                  aria-label="Dirección de partida"
                  onChange={(e) => setOtherStart(e.target.value)}
                  placeholder="Calle y número, localidad"
                  value={otherStart}
                />
              ) : null}
            </div>
          </Row>
          <div className="flex justify-end p-4">
            <Button onClick={goToStep2}>Recomendar paradas</Button>
          </div>
        </Card>
      ) : (
        <Card className="gap-0 p-0">
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="font-semibold">Te recomendamos a quién visitar</h3>
              <Badge variant="secondary">
                {selected.length} de {routeSettings.tope} paradas
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              El universo en la zona: {recommendation.universe} cuentas
              (clientes y prospectos del vendedor). Las de otros vendedores no
              entran.
            </p>
            <Input
              aria-label="Sumar una cuenta"
              disabled={atLimit}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                atLimit
                  ? `Llegaste al tope de ${routeSettings.tope}. Sacá una para sumar otra.`
                  : "Sumar una cuenta del universo…"
              }
              value={search}
            />
            {searchResults.length ? (
              <div className="rounded-md border">
                {searchResults.map((candidate) => (
                  <button
                    className="flex w-full items-center justify-between gap-2 border-t px-3 py-2 text-left text-sm first:border-t-0 hover:bg-muted"
                    key={candidate.id}
                    onClick={() => {
                      setSelected((prev) => [...prev, candidate]);
                      setSearch("");
                    }}
                    type="button"
                  >
                    <span>{candidate.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {candidate.reason}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {selected.length ? (
            selected.map((stop, index) => (
              <div
                className="flex items-start gap-3 border-t px-4 py-3"
                key={stop.id}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-primary font-semibold text-xs">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {stop.name}
                    <Badge variant="outline">
                      {stop.kind === "cliente" ? "Cliente" : "Prospecto"}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground text-sm">{stop.reason}</p>
                </div>
                <Button
                  aria-label={`Sacar ${stop.name}`}
                  onClick={() =>
                    setSelected((prev) => prev.filter((s) => s.id !== stop.id))
                  }
                  size="icon"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>
            ))
          ) : (
            <EmptyRow>
              No hay cuentas para recomendar en esa zona. Probá con otra zona o
              dejá las localidades vacías.
            </EmptyRow>
          )}
          {leftOut.length ? (
            <p className="border-t px-4 py-3 text-muted-foreground text-sm">
              Quedaron afuera:{" "}
              {leftOut
                .slice(0, 3)
                .map((c) => c.name)
                .join(", ")}
              {leftOut.length > 3 ? ` y ${leftOut.length - 3} más` : ""}.
              Buscalas arriba para sumarlas.
            </p>
          ) : null}
          <div className="flex justify-between gap-2 border-t p-4">
            <Button onClick={() => setStep(1)} variant="ghost">
              Atrás
            </Button>
            <Button disabled={pending || selected.length === 0} onClick={save}>
              {sellerId === snapshot.currentUserId
                ? "Guardar ruta"
                : `Asignar a ${snapshot.sellers.find((s) => s.id === sellerId)?.shortName ?? "vendedor"}`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 p-4 md:grid-cols-[160px_minmax(0,1fr)]">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ============ Detalle de una ruta ============ */

function RouteDetail({
  routeId,
  onBack,
}: {
  routeId: string;
  onBack: () => void;
}) {
  const { snapshot, isManager, openCustomer, openProspect } = useCommercialAi();
  const route = snapshot.prospecting.routes.find((r) => r.id === routeId);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!route) {
    return (
      <div className="space-y-3">
        <Button onClick={onBack} variant="ghost">
          <ArrowLeftIcon />
          Volver
        </Button>
        <p className="text-muted-foreground text-sm">
          No encontramos esa ruta.
        </p>
      </div>
    );
  }

  const stats = routeStats(route, snapshot.today);
  const pendingStops = route.stops.filter((s) => !s.result);
  const mapsUrl = googleMapsRouteUrl(pendingStops, route.startLabel);

  const remove = () =>
    startTransition(async () => {
      const result = await deleteRouteAction(snapshot.orgSlug, route.id);
      if (result.success) {
        toast.success("Ruta borrada.");
        onBack();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label="Volver"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="font-heading text-xl capitalize">
          {shortDay(route.date)}
        </h2>
        {route.places.length ? (
          <span className="text-muted-foreground text-sm">
            · {route.places.join(", ")}
          </span>
        ) : null}
        {isManager ? <SellerChip sellerId={route.sellerId} /> : null}
        <div className="ml-auto flex gap-2">
          {mapsUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={mapsUrl} rel="noopener noreferrer" target="_blank">
                <MapPinIcon />
                Abrir en Google Maps
              </a>
            </Button>
          ) : null}
          <Button
            className="text-destructive"
            disabled={pending}
            onClick={remove}
            size="sm"
            variant="ghost"
          >
            <TrashIcon />
            Borrar
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        {stats.done} de {stats.planned} hechas · {stats.orders} pedidos ·{" "}
        {stats.followUps} seguimientos
        {route.startLabel ? ` · sale de ${route.startLabel}` : ""}
      </p>

      <SectionCard title="Paradas">
        {route.stops.map((stop) => (
          <div className="border-t px-4 py-3" key={stop.id}>
            <div className="flex flex-wrap items-start gap-3">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2 font-semibold text-xs",
                  stopBadgeClass(stop.result)
                )}
              >
                {stop.position}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  className="font-medium hover:underline"
                  onClick={() =>
                    stop.kind === "cliente"
                      ? openCustomer(stop.accountId)
                      : openProspect(stop.accountId)
                  }
                  type="button"
                >
                  {stop.name}
                </button>
                <span className="ml-2 text-muted-foreground text-xs">
                  {stop.kind === "cliente" ? "Cliente" : "Prospecto"}
                  {stop.city ? ` · ${stop.city}` : ""}
                </span>
                <p className="text-muted-foreground text-sm">{stop.reason}</p>
                {stop.note ? <p className="text-sm">“{stop.note}”</p> : null}
                <CheckinLocationLine
                  checkin={snapshot.prospecting.checkins.find(
                    (c) => c.stopId === stop.id
                  )}
                />
              </div>
              {stop.result ? (
                <Badge
                  className={cn(
                    "border-transparent",
                    VISIT_RESULTS[stop.result].className
                  )}
                >
                  {VISIT_RESULTS[stop.result].label}
                </Badge>
              ) : null}
              <Button
                onClick={() => setEditing(editing === stop.id ? null : stop.id)}
                size="sm"
                variant="outline"
              >
                {stop.result ? "Cambiar" : "Registrar"}
              </Button>
            </div>
            {editing === stop.id ? (
              <StopResultForm
                customerId={stop.kind === "cliente" ? stop.accountId : null}
                onDone={() => setEditing(null)}
                orgSlug={snapshot.orgSlug}
                stopId={stop.id}
                stopKind={stop.kind}
              />
            ) : null}
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function StopResultForm({
  orgSlug,
  stopId,
  stopKind,
  customerId,
  onDone,
}: {
  orgSlug: string;
  stopId: string;
  stopKind: RouteView["stops"][number]["kind"];
  customerId: string | null;
  onDone: () => void;
}) {
  return (
    <div className="mt-3">
      <VisitResultPicker
        hint={
          stopKind === "cliente"
            ? "Si marcás “Pedido”, se abre la preventa con el cliente elegido."
            : undefined
        }
        onSave={async (result, note, location) => {
          const response = await recordStopResultAction(orgSlug, {
            stopId,
            result,
            note,
            location,
          });
          if (response.success) {
            onDone();
            if (result === "pedido" && stopKind === "cliente" && customerId) {
              window.location.href = `/org/${orgSlug}/preventa/nueva?customerId=${encodeURIComponent(customerId)}`;
            }
          }
          return response;
        }}
      />
    </div>
  );
}
