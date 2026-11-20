import type { RouteDayResult } from "./contracts";

type RouteEventAction =
  RouteDayResult["routes"][number]["events"][number]["action"];

export const routeEventLabels = {
  created: "Ruta iniciada",
  reordered: "Orden planificado actualizado",
  closed: "Ruta cerrada",
  reopened: "Ruta reabierta",
  corrected: "Visita marcada como equivocada",
} satisfies Record<RouteEventAction, string>;
