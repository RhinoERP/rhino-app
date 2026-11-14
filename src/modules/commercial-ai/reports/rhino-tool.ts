import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantChannel } from "../service/assistant.service";
import { GRAINS, PERIOD_PRESETS, type ReportSpec } from "./catalog";
import {
  availableDatasets,
  type ReportAccess,
  ReportError,
  runReport,
} from "./run-report";

/**
 * Le da a RHINO (el chat) acceso a todos los datos del negocio a través del
 * mismo motor del Generador de reportes, con los permisos del usuario.
 */

const TOOL_NAME = "consultar_datos";
const MAX_TOOL_ROWS = 30;

export function reportsChannel(access: ReportAccess): AssistantChannel | null {
  const datasets = availableDatasets(access);
  if (!datasets.length) {
    return null;
  }
  const catalog = datasets
    .map(
      (d) =>
        `${d.id} (${d.label}${d.dated ? "" : ", foto de hoy"}): dimensiones ${d.dimensions.map((x) => x.key).join(", ")}; métricas ${d.measures.map((m) => m.key).join(", ")}`
    )
    .join("\n");

  const tool: Anthropic.Beta.BetaTool = {
    name: TOOL_NAME,
    description: `Consulta cualquier dato del negocio (ventas, productos, clientes, cobranzas, deuda, compras, proveedores, gastos, stock, actividad) agrupado y medido como un reporte. Fuentes:\n${catalog}`,
    input_schema: {
      type: "object",
      properties: {
        dataset: { type: "string", enum: datasets.map((d) => d.id) },
        agrupar_por: {
          type: ["string", "null"],
          description: "Dimensión para agrupar, o null para totales.",
        },
        metricas: { type: "array", items: { type: "string" } },
        periodo: { type: "string", enum: PERIOD_PRESETS.map((p) => p.key) },
        desde: {
          type: ["string", "null"],
          description: "AAAA-MM-DD si periodo=personalizado",
        },
        hasta: {
          type: ["string", "null"],
          description: "AAAA-MM-DD si periodo=personalizado",
        },
        grano: { type: "string", enum: GRAINS.map((g) => g.key) },
        filtros: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dimension: { type: "string" },
              valores: { type: "array", items: { type: "string" } },
            },
            required: ["dimension", "valores"],
          },
        },
        top: { type: ["integer", "null"] },
        orden: { type: ["string", "null"], enum: ["mayor", "menor", null] },
        comparar: {
          type: "boolean",
          description: "Traer también el período anterior.",
        },
      },
      required: ["dataset", "metricas"],
    },
  };

  return {
    prompt: `Para datos que no estén en el resumen (stock, compras, proveedores, gastos, cobranzas, deuda, productos, zonas, días, comparaciones) usá "${TOOL_NAME}": trae los números reales con los permisos del usuario. Si el usuario quiere verlo en detalle, sugerile abrir IA Comercial → Reportes.`,
    tools: [tool],
    runTool: (block) => {
      if (block.name !== TOOL_NAME) {
        return null;
      }
      return runTool(access, block);
    },
  };
}

function specFromInput(input: Record<string, unknown>): Partial<ReportSpec> {
  const measures = Array.isArray(input.metricas)
    ? (input.metricas as string[])
    : [];
  const filters = Array.isArray(input.filtros)
    ? (input.filtros as { dimension: string; valores?: string[] }[])
    : [];
  return {
    dataset: String(input.dataset ?? ""),
    groupBy: (input.agrupar_por as string | null) ?? null,
    measures,
    period: (input.periodo as ReportSpec["period"]) ?? "este_mes",
    from: (input.desde as string | null) ?? null,
    to: (input.hasta as string | null) ?? null,
    grain: (input.grano as ReportSpec["grain"]) ?? "mes",
    filters: filters.map((f) => ({
      dimension: f.dimension,
      values: f.valores ?? [],
    })),
    limit: (input.top as number | null) ?? MAX_TOOL_ROWS,
    sort:
      input.orden && measures[0]
        ? { by: measures[0], dir: input.orden === "menor" ? "asc" : "desc" }
        : null,
    compare: Boolean(input.comparar),
    chart: "table",
  };
}

async function runTool(
  access: ReportAccess,
  block: Anthropic.Beta.BetaToolUseBlock
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const spec = specFromInput(block.input as Record<string, unknown>);
  try {
    const report = await runReport(access, spec);
    const content = JSON.stringify({
      reporte: report.title,
      periodo: report.periodLabel,
      metricas: report.measures.map((m) => `${m.key}=${m.label} (${m.format})`),
      totales: report.totals,
      totales_anterior: report.previousTotals,
      filas: report.rows.slice(0, MAX_TOOL_ROWS + 1).map((r) => ({
        grupo: r.label,
        ...r.values,
        ...(report.previousByKey?.[r.key]
          ? { anterior: report.previousByKey[r.key] }
          : {}),
      })),
      grupos_totales: report.groupCount,
      notas: report.notes,
    });
    return { type: "tool_result", tool_use_id: block.id, content };
  } catch (error) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        error instanceof ReportError
          ? error.message
          : "No se pudo consultar ese dato.",
    };
  }
}
