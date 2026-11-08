import "server-only";

import { createAiMessage } from "../service/ai-client";
import { todayInArgentina } from "../service/commercial-ai.service";
import {
  CHARTS,
  type Dataset,
  GRAINS,
  PERIOD_PRESETS,
  type ReportSpec,
  sanitizeSpec,
} from "./catalog";
import type { ReportAccess, ReportResult } from "./run-report";

/**
 * RHINO arma el reporte a partir de un pedido en palabras ("ventas por
 * vendedor del último trimestre") y, si se pide, explica el resultado.
 */

export class ReportAiError extends Error {}

function catalogText(datasets: Dataset[]): string {
  return datasets
    .map(
      (d) =>
        `- ${d.id}: ${d.label}. ${d.description}${d.dated ? "" : " (Foto de hoy: no usa período.)"}\n  dimensiones: ${d.dimensions.map((x) => `${x.key} (${x.label})`).join(", ")}\n  métricas: ${d.measures.map((m) => `${m.key} (${m.label})`).join(", ")}`
    )
    .join("\n");
}

function specSchema(datasets: Dataset[]): Record<string, unknown> {
  const nullableString = { type: ["string", "null"] };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "posible",
      "motivo",
      "titulo",
      "dataset",
      "groupBy",
      "splitBy",
      "measures",
      "period",
      "from",
      "to",
      "grain",
      "filters",
      "sortBy",
      "sortDir",
      "limit",
      "chart",
      "compare",
    ],
    properties: {
      posible: {
        type: "boolean",
        description:
          "false si el pedido no se puede responder con estos datos.",
      },
      motivo: {
        ...nullableString,
        description:
          "Si no es posible, por qué y qué sí se puede ver (una oración).",
      },
      titulo: { type: "string", description: "Título corto del reporte." },
      dataset: { type: "string", enum: datasets.map((d) => d.id) },
      groupBy: {
        ...nullableString,
        description: "Dimensión principal o null para un total.",
      },
      splitBy: {
        ...nullableString,
        description: "Segunda dimensión para abrir en series (opcional).",
      },
      measures: {
        type: "array",
        items: { type: "string" },
        description: "1 a 4 métricas de la fuente elegida.",
      },
      period: { type: "string", enum: PERIOD_PRESETS.map((p) => p.key) },
      from: {
        ...nullableString,
        description: "AAAA-MM-DD si period es personalizado.",
      },
      to: {
        ...nullableString,
        description: "AAAA-MM-DD si period es personalizado.",
      },
      grain: { type: "string", enum: GRAINS.map((g) => g.key) },
      filters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["dimension", "values"],
          properties: {
            dimension: { type: "string" },
            values: { type: "array", items: { type: "string" } },
          },
        },
      },
      sortBy: {
        ...nullableString,
        description: "Clave de métrica, 'label' o null para el orden normal.",
      },
      sortDir: { type: "string", enum: ["asc", "desc"] },
      limit: {
        type: ["integer", "null"],
        description: "Top N, o null para todo.",
      },
      chart: { type: "string", enum: CHARTS.map((c) => c.key) },
      compare: {
        type: "boolean",
        description: "Comparar con el período anterior.",
      },
    },
  };
}

type AiSpec = {
  posible: boolean;
  motivo: string | null;
  titulo: string;
  dataset: string;
  groupBy: string | null;
  splitBy: string | null;
  measures: string[];
  period: ReportSpec["period"];
  from: string | null;
  to: string | null;
  grain: ReportSpec["grain"];
  filters: ReportSpec["filters"];
  sortBy: string | null;
  sortDir: "asc" | "desc";
  limit: number | null;
  chart: ReportSpec["chart"];
  compare: boolean;
};

function meterOf(access: ReportAccess) {
  return {
    organizationId: access.organizationId,
    userId: access.userId,
    userName: access.userName,
    feature: "reporte" as const,
  };
}

/** Pasa un pedido en palabras a la especificación del reporte. */
export async function specFromQuestion(
  access: ReportAccess,
  datasets: Dataset[],
  question: string,
  current?: Partial<ReportSpec> | null
): Promise<ReportSpec> {
  if (!datasets.length) {
    throw new ReportAiError("No tenés permiso para ver datos en reportes.");
  }
  const system = `Sos RHINO, el analista de datos de una distribuidora dentro de Rhinos (sistema de gestión). Convertís el pedido del usuario en la especificación de un reporte usando SOLO estas fuentes:
${catalogText(datasets)}

Reglas:
- Hoy es ${todayInArgentina()}. "Este año" = desde el 1 de enero; "el mes pasado" = mes calendario anterior. Si no dicen período, usá el más razonable (este_mes para ventas del día a día, ultimos_12_meses para evoluciones).
- Si piden una evolución en el tiempo, groupBy = "fecha" con el grain adecuado (dia hasta 45 días, semana hasta 4 meses, mes para más) y chart line, area o bar.
- Rankings ("los mejores", "top", "quién más") → orden desc por la métrica y limit (10 o 20 si no dicen). Para "los peores" o "los que menos", sortDir asc.
- Para nombres concretos (un cliente, un vendedor, una marca, una localidad) usá filters con lo que escribió el usuario; se busca por coincidencia parcial.
- "Comparado con", "contra el año pasado", "cómo venimos" → compare true.
- Torta solo para repartos de pocas partes (hasta 8).
- Si el pedido modifica el reporte actual ("ahora por mes", "sacá los impuestos"), partí del reporte actual.
- Si no hay datos para responder (por ejemplo, rentabilidad exacta o datos que no están en las fuentes), posible=false y en motivo decí qué sí se puede ver.`;
  const content = current
    ? `Reporte actual: ${JSON.stringify(current)}\n\nPedido: ${question}`
    : `Pedido: ${question}`;
  const result = await createAiMessage({
    meter: meterOf(access),
    system,
    messages: [{ role: "user", content }],
    maxTokens: 1500,
    schema: specSchema(datasets),
  });
  if (!result.ok || result.truncated) {
    throw new ReportAiError(
      "No pude entender el pedido. Probá decirlo de otra forma."
    );
  }
  let ai: AiSpec;
  try {
    ai = JSON.parse(result.text) as AiSpec;
  } catch {
    throw new ReportAiError(
      "No pude entender el pedido. Probá decirlo de otra forma."
    );
  }
  if (!ai.posible) {
    throw new ReportAiError(
      ai.motivo || "Con los datos de Rhinos no puedo armar ese reporte."
    );
  }
  const spec = sanitizeSpec({
    dataset: ai.dataset,
    groupBy: ai.groupBy,
    splitBy: ai.splitBy,
    measures: ai.measures,
    period: ai.period,
    from: ai.from,
    to: ai.to,
    grain: ai.grain,
    filters: ai.filters,
    sort: ai.sortBy ? { by: ai.sortBy, dir: ai.sortDir } : null,
    limit: ai.limit,
    chart: ai.chart,
    compare: ai.compare,
    title: ai.titulo,
  });
  if (!(spec && datasets.some((d) => d.id === spec.dataset))) {
    throw new ReportAiError("No pude armar ese reporte con tus datos.");
  }
  return spec;
}

const MAX_ROWS_FOR_INSIGHTS = 40;

/** Conclusiones cortas sobre un reporte ya calculado. */
export async function explainReport(
  access: ReportAccess,
  report: ReportResult
): Promise<string> {
  const payload = {
    titulo: report.title,
    fuente: report.datasetLabel,
    periodo: report.periodLabel,
    agrupado_por: report.groupLabel,
    metricas: report.measures.map((m) => `${m.key}: ${m.label} (${m.format})`),
    totales: report.totals,
    totales_periodo_anterior: report.previousTotals,
    filas: report.rows.slice(0, MAX_ROWS_FOR_INSIGHTS).map((r) => ({
      [report.groupLabel ?? "grupo"]: r.label,
      ...r.values,
      ...(report.previousByKey?.[r.key]
        ? { anterior: report.previousByKey[r.key] }
        : {}),
    })),
    filas_totales: report.groupCount,
  };
  const result = await createAiMessage({
    meter: meterOf(access),
    system: `Sos RHINO, el analista comercial de una distribuidora. Te paso un reporte ya calculado. Escribí en español rioplatense, con voseo, 3 a 5 viñetas ("- ") con lo más importante: qué subió o bajó y cuánto, quién concentra más, alertas, y una acción concreta al final. Usá **negrita** para lo clave. Montos abreviados en pesos ($1,2M, $350k). No inventes nada que no esté en los datos. Máximo 130 palabras.`,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    maxTokens: 700,
  });
  if (!result.ok) {
    throw new ReportAiError("No pude analizar este reporte.");
  }
  return result.text;
}
