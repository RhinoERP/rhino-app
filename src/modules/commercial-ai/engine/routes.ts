/**
 * Recomendación de paradas para una ruta (reglas, sin IA).
 *
 * Toma el "universo" del vendedor en la zona elegida (sus clientes con
 * historial y sus prospectos abiertos) y los ordena según la prioridad que
 * configuró el gerente: valor de la oportunidad, riesgo o dormido,
 * seguimiento que vence y días sin visita.
 */

import type {
  CommercialAiTask,
  CustomerView,
  OpportunityView,
  ProspectView,
  RouteFactor,
  RouteSettings,
  RouteView,
} from "../types";
import { formatMoneyShort } from "./analysis";

const OPEN_STAGES = new Set(["nueva", "contactada", "respondio", "despues"]);
const OPEN_PROSPECT_STAGES = new Set([
  "sin_contactar",
  "contactado",
  "en_conversacion",
  "esperando_pedido",
]);
const FACTOR_WEIGHTS = [1, 0.7, 0.45, 0.25];
const DAYS_FOR_FULL_SCORE = 30;
const DEFAULT_DAYS_WITHOUT_VISIT = 21;
const MS_PER_DAY = 86_400_000;
const FOLLOW_UP_AFTER_DAYS = 3;
const PROSPECT_FIT_DIVISOR = 100;

export type StopCandidate = {
  kind: "cliente" | "prospecto";
  id: string;
  name: string;
  city: string | null;
  score: number;
  reason: string;
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Una localidad cae en la zona si coincide con alguno de sus lugares. */
export function isInPlaces(city: string | null, places: string[]): boolean {
  if (places.length === 0) {
    return true;
  }
  const target = normalize(city);
  if (!target) {
    return false;
  }
  return places.some((place) => {
    const name = normalize(place.split(",")[0]);
    return name !== "" && (target === name || target.includes(name));
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor(
    (new Date(toIso.slice(0, 10)).getTime() -
      new Date(fromIso.slice(0, 10)).getTime()) /
      MS_PER_DAY
  );
}

function lastVisitByAccount(
  routes: RouteView[],
  before: string
): Map<string, string> {
  const last = new Map<string, string>();
  for (const route of routes) {
    if (route.date >= before) {
      continue;
    }
    for (const stop of route.stops) {
      if (!stop.result || stop.result === "nofue") {
        continue;
      }
      const previous = last.get(stop.accountId);
      if (!previous || route.date > previous) {
        last.set(stop.accountId, route.date);
      }
    }
  }
  return last;
}

type ScoreInput = {
  factors: Record<RouteFactor, number>;
  order: RouteFactor[];
};

function weightedScore({ factors, order }: ScoreInput): number {
  return order.reduce(
    (acc, factor, index) =>
      acc + (FACTOR_WEIGHTS[index] ?? 0) * factors[factor],
    0
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cada factor de prioridad suma su motivo legible
function scoreCustomer({
  customer,
  date,
  order,
  maxValue,
  value,
  opportunities: allOpportunities,
  tasks,
  visited,
}: {
  customer: CustomerView;
  date: string;
  order: RouteFactor[];
  maxValue: number;
  value: number;
  opportunities: OpportunityView[];
  tasks: CommercialAiTask[];
  visited: string | undefined;
}): StopCandidate {
  const opportunities = allOpportunities.filter(
    (o) => o.customerId === customer.id && OPEN_STAGES.has(o.effectiveStage)
  );
  const retention = opportunities.find(
    (o) => o.type === "riesgo" || o.type === "reactivar"
  );
  const task = tasks.find(
    (t) => t.customerId === customer.id && !t.doneAt && t.dueDate <= date
  );
  const followUp = opportunities.find(
    (o) =>
      o.effectiveStage === "respondio" ||
      (o.effectiveStage === "contactada" &&
        o.state.contactedAt !== null &&
        daysBetween(o.state.contactedAt, date) >= FOLLOW_UP_AFTER_DAYS)
  );
  const daysWithoutVisit = visited
    ? daysBetween(visited, date)
    : Math.max(customer.metrics.daysSince ?? 0, DEFAULT_DAYS_WITHOUT_VISIT);

  const reasons: string[] = [];
  if (retention) {
    reasons.push(
      retention.type === "riesgo"
        ? "En riesgo: compra menos que antes"
        : `Dormido: ${customer.metrics.daysSince ?? 0} días sin comprar`
    );
  }
  if (value > 0) {
    reasons.push(`Oportunidad de ${formatMoneyShort(value)}/mes abierta`);
  }
  if (task) {
    reasons.push(`Próximo paso: ${task.body}`);
  } else if (followUp) {
    reasons.push(
      followUp.effectiveStage === "respondio"
        ? "Respondió: falta cerrar"
        : "Contactado sin respuesta"
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      visited
        ? `Sin visita hace ${daysWithoutVisit} días`
        : "Sin visita registrada"
    );
  }

  return {
    kind: "cliente",
    id: customer.id,
    name: customer.name,
    city: customer.city,
    score: weightedScore({
      factors: {
        valor: value / maxValue,
        riesgo: retention ? 1 : 0,
        seguimiento: task || followUp ? 1 : 0,
        dias: Math.min(1, daysWithoutVisit / DAYS_FOR_FULL_SCORE),
      },
      order,
    }),
    reason: reasons.slice(0, 2).join(" · "),
  };
}

function prospectReason(
  prospect: ProspectView,
  dueStep: boolean,
  inConversation: boolean
): string {
  if (dueStep) {
    return `Próximo paso: ${prospect.nextStep ?? "seguimiento"}`;
  }
  return inConversation
    ? "En conversación: falta el seguimiento"
    : `Prospecto con encaje ${prospect.fitScore}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: arma el universo de clientes y prospectos con sus filtros
export function recommendStops(params: {
  date: string;
  sellerId: string | null;
  places: string[];
  settings: RouteSettings;
  customers: CustomerView[];
  opportunities: OpportunityView[];
  tasks: CommercialAiTask[];
  prospects: ProspectView[];
  routes: RouteView[];
  /** Cuentas que ya están en otra ruta de ese día. */
  busyAccountIds?: Set<string>;
}): { selected: StopCandidate[]; rest: StopCandidate[]; universe: number } {
  const { date, sellerId, places, settings } = params;
  const busy = params.busyAccountIds ?? new Set<string>();
  const lastVisit = lastVisitByAccount(params.routes, date);

  const customers = params.customers.filter(
    (customer) =>
      (sellerId === null || customer.sellerId === sellerId) &&
      customer.metrics.orderCount > 0 &&
      !busy.has(customer.id) &&
      isInPlaces(customer.city, places)
  );

  const valueByCustomer = new Map<string, number>();
  for (const opportunity of params.opportunities) {
    if (OPEN_STAGES.has(opportunity.effectiveStage)) {
      valueByCustomer.set(
        opportunity.customerId,
        (valueByCustomer.get(opportunity.customerId) ?? 0) + opportunity.value
      );
    }
  }
  const maxValue = Math.max(1, ...valueByCustomer.values());

  const candidates: StopCandidate[] = customers.map((customer) =>
    scoreCustomer({
      customer,
      date,
      order: settings.orden,
      maxValue,
      value: valueByCustomer.get(customer.id) ?? 0,
      opportunities: params.opportunities,
      tasks: params.tasks,
      visited: lastVisit.get(customer.id),
    })
  );

  for (const prospect of params.prospects) {
    if (
      (sellerId !== null && prospect.sellerId !== sellerId) ||
      !OPEN_PROSPECT_STAGES.has(prospect.stage) ||
      busy.has(prospect.id) ||
      !isInPlaces(prospect.city, places)
    ) {
      continue;
    }
    const inConversation =
      prospect.stage === "en_conversacion" ||
      prospect.stage === "esperando_pedido";
    const dueStep =
      prospect.nextStepDate !== null && prospect.nextStepDate <= date;
    candidates.push({
      kind: "prospecto",
      id: prospect.id,
      name: prospect.name,
      city: prospect.city,
      score: weightedScore({
        factors: {
          valor: prospect.fitScore / PROSPECT_FIT_DIVISOR / 2,
          riesgo: 0,
          seguimiento: inConversation || dueStep ? 1 : 0,
          dias: prospect.stage === "sin_contactar" ? 0.5 : 0,
        },
        order: settings.orden,
      }),
      reason: prospectReason(prospect, dueStep, inConversation),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    selected: candidates.slice(0, settings.tope),
    rest: candidates.slice(settings.tope),
    universe: candidates.length,
  };
}

export type RouteStats = {
  planned: number;
  done: number;
  missed: number;
  unregistered: number;
  orders: number;
  followUps: number;
  prospectsVisited: number;
};

export function routeStats(route: RouteView, today: string): RouteStats {
  const done = route.stops.filter((s) => s.result && s.result !== "nofue");
  return {
    planned: route.stops.length,
    done: done.length,
    missed: route.stops.filter((s) => s.result === "nofue").length,
    unregistered:
      route.date < today ? route.stops.filter((s) => !s.result).length : 0,
    orders: route.stops.filter((s) => s.result === "pedido").length,
    followUps: route.stops.filter((s) => s.result === "seguimiento").length,
    prospectsVisited: done.filter((s) => s.kind === "prospecto").length,
  };
}

export function routeStatus(
  route: RouteView,
  today: string
): "Planificada" | "En curso" | "Terminada" {
  if (route.date > today) {
    return "Planificada";
  }
  if (route.date < today) {
    return "Terminada";
  }
  return route.stops.every((s) => s.result) ? "Terminada" : "En curso";
}

/** Link de Google Maps con las paradas pendientes (hasta 9 puntos intermedios). */
export function googleMapsRouteUrl(
  stops: { address: string | null; name: string; city: string | null }[],
  start: string | null
): string | null {
  const points = stops
    .map((s) => s.address || [s.name, s.city].filter(Boolean).join(", "))
    .filter(Boolean);
  if (points.length === 0) {
    return null;
  }
  const origin = start || points[0];
  const destination = points.at(-1) ?? origin;
  const waypoints = points.slice(start ? 0 : 1, -1).slice(0, 9);
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints.length) {
    params.set("waypoints", waypoints.join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
