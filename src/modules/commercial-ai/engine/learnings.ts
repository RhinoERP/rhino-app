/**
 * Aprendizajes: patrones simples sobre lo que el equipo ya decidió.
 * Compara tasas de éxito entre grupos y solo muestra diferencias con
 * suficientes casos de cada lado, para no confundir casualidad con patrón.
 */
import { OPPORTUNITY_TYPES } from "../constants";
import type {
  LearnedPattern,
  OpportunityType,
  OpportunityView,
  ProspectView,
  RouteView,
} from "../types";

export const MIN_CASES_PER_GROUP = 3;
const MIN_DIFFERENCE = 0.15;
const DECIDED = new Set(["ganada", "perdida", "ignorada"]);
const PROSPECT_POSITIVE = new Set(["en_conversacion", "esperando_pedido"]);
const PROSPECT_CONTACTED = new Set([
  "contactado",
  "en_conversacion",
  "esperando_pedido",
  "perdido",
]);

function pct(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function opportunityPatterns(
  opportunities: OpportunityView[]
): LearnedPattern[] {
  const decided = opportunities.filter((o) => DECIDED.has(o.effectiveStage));
  if (decided.length < MIN_CASES_PER_GROUP * 2) {
    return [];
  }
  const overall =
    decided.filter((o) => o.effectiveStage === "ganada").length /
    decided.length;
  const patterns: LearnedPattern[] = [];
  for (const type of Object.keys(OPPORTUNITY_TYPES) as OpportunityType[]) {
    const group = decided.filter((o) => o.type === type);
    if (group.length < MIN_CASES_PER_GROUP) {
      continue;
    }
    const rate =
      group.filter((o) => o.effectiveStage === "ganada").length / group.length;
    if (Math.abs(rate - overall) >= MIN_DIFFERENCE) {
      patterns.push({
        key: `opp-${type}`,
        title: `${OPPORTUNITY_TYPES[type].label}: se gana el ${pct(rate)}`,
        detail: `${rate > overall ? "Más" : "Menos"} que el promedio de la cartera (${pct(overall)}). ${rate > overall ? "Conviene priorizarlas." : "Revisá el mensaje o la oferta."}`,
        sample: group.length,
      });
    }
  }
  return patterns;
}

function prospectPatterns(prospects: ProspectView[]): LearnedPattern[] {
  const contacted = prospects.filter((p) => PROSPECT_CONTACTED.has(p.stage));
  if (contacted.length < MIN_CASES_PER_GROUP * 2) {
    return [];
  }
  const highFit = contacted.filter((p) => p.fitScore >= 75);
  const lowFit = contacted.filter((p) => p.fitScore < 75);
  if (
    highFit.length < MIN_CASES_PER_GROUP ||
    lowFit.length < MIN_CASES_PER_GROUP
  ) {
    return [];
  }
  const rate = (list: ProspectView[]) =>
    list.filter((p) => PROSPECT_POSITIVE.has(p.stage)).length / list.length;
  const high = rate(highFit);
  const low = rate(lowFit);
  if (Math.abs(high - low) < MIN_DIFFERENCE) {
    return [];
  }
  return [
    {
      key: "prospect-fit",
      title: `Encaje alto responde ${pct(high)} vs ${pct(low)}`,
      detail:
        high > low
          ? "El puntaje de encaje está funcionando: subí la afinidad mínima de las campañas para gastar menos en prospectos flojos."
          : "Los de encaje bajo responden igual o mejor: revisá el perfil de cliente ideal, quizás es muy estrecho.",
      sample: contacted.length,
    },
  ];
}

function visitPatterns(routes: RouteView[]): LearnedPattern[] {
  const visited = routes.flatMap((r) => r.stops).filter((s) => s.result);
  if (visited.length < MIN_CASES_PER_GROUP * 2) {
    return [];
  }
  const away =
    visited.filter((s) => s.result === "noestaba").length / visited.length;
  const orders =
    visited.filter((s) => s.result === "pedido").length / visited.length;
  const patterns: LearnedPattern[] = [];
  if (away >= 0.25) {
    patterns.push({
      key: "visit-away",
      title: `En ${pct(away)} de las visitas no estaba el encargado`,
      detail:
        "Avisá por WhatsApp el día anterior o probá otro horario para esos clientes.",
      sample: visited.length,
    });
  }
  patterns.push({
    key: "visit-orders",
    title: `${pct(orders)} de las visitas terminan en pedido`,
    detail: "Es la tasa de conversión de las rutas registradas.",
    sample: visited.length,
  });
  return patterns;
}

export function computePatterns(params: {
  opportunities: OpportunityView[];
  prospects: ProspectView[];
  routes: RouteView[];
}): LearnedPattern[] {
  return [
    ...opportunityPatterns(params.opportunities),
    ...prospectPatterns(params.prospects),
    ...visitPatterns(params.routes),
  ];
}
