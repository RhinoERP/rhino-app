import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  OPEN_STAGES,
  OPPORTUNITY_TYPES,
  STAGES,
  SUGGESTED_QUESTIONS,
} from "../constants";
import { formatMoneyShort } from "../engine/analysis";
import type { CommercialAiSnapshot } from "../types";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_HISTORY_MESSAGES = 12;
const MAX_CONTEXT_OPPORTUNITIES = 40;
const MAX_CONTEXT_CUSTOMERS = 60;

export type AssistantMessage = { role: "user" | "assistant"; content: string };

const STATUS_TEXT = {
  activo: "Activo",
  riesgo: "En riesgo",
  dormido: "Dormido",
};

/** Datos que el asistente puede usar, ya filtrados por el rol del usuario. */
export function buildAssistantContext(snapshot: CommercialAiSnapshot) {
  const sellerName = (id: string | null) =>
    snapshot.sellers.find((s) => s.id === id)?.name ?? "Sin asignar";
  const isManager = snapshot.role === "gerente";

  const openOpportunities = snapshot.opportunities
    .filter((o) => OPEN_STAGES.includes(o.effectiveStage))
    .slice(0, MAX_CONTEXT_OPPORTUNITIES)
    .map((o) => ({
      id: o.key,
      cliente: o.customerName,
      cid: o.customerId,
      ...(isManager ? { vendedor: sellerName(o.sellerId) } : {}),
      tipo: OPPORTUNITY_TYPES[o.type].label,
      producto: o.productName ?? o.categoryName,
      valor_mes: Math.round(o.value),
      etapa: STAGES[o.effectiveStage].label,
      evidencia: o.evidenceShort,
      mensaje_sugerido: o.message,
    }));

  const portfolio = snapshot.customers
    .filter((c) => c.metrics.status !== "activo" || c.overdue > 0)
    .slice(0, MAX_CONTEXT_CUSTOMERS)
    .map((c) => ({
      cliente: c.name,
      cid: c.id,
      ...(isManager ? { vendedor: sellerName(c.sellerId) } : {}),
      estado: STATUS_TEXT[c.metrics.status],
      dias_sin_comprar: c.metrics.daysSince,
      compra_mensual: Math.round(c.metrics.monthly),
      deuda_vencida: Math.round(c.overdue),
      dias_de_atraso: c.maxDaysLate,
    }));

  const pendingTasks = snapshot.tasks
    .filter((t) => !t.doneAt)
    .map((t) => ({
      cliente: snapshot.customers.find((c) => c.id === t.customerId)?.name,
      cid: t.customerId,
      que: t.body,
      vence: t.dueDate,
    }));

  const plan = isManager
    ? {
        equipo: {
          meta: Math.round(snapshot.plan.team.target),
          real: Math.round(snapshot.plan.team.real),
        },
        por_vendedor: snapshot.plan.sellers.map((s) => ({
          vendedor: sellerName(s.sellerId),
          meta: Math.round(s.target),
          real: Math.round(s.real),
        })),
      }
    : snapshot.plan.sellers.map((s) => ({
        meta: Math.round(s.target),
        real: Math.round(s.real),
        palancas: Object.fromEntries(
          Object.entries(s.levers).map(([k, v]) => [
            k,
            { real: Math.round(v.real), plan: Math.round(v.plan) },
          ])
        ),
      }))[0];

  return {
    hoy: snapshot.today,
    datos_al: snapshot.dataAsOf,
    dia_del_mes: `${snapshot.plan.dayOfMonth} de ${snapshot.plan.daysInMonth}`,
    usuario: `${snapshot.currentUserName}, ${isManager ? "gerente comercial" : "vendedor"}`,
    plan_del_mes: plan,
    oportunidades_abiertas: openOpportunities,
    clientes_en_riesgo_dormidos_o_con_deuda: portfolio,
    proximos_pasos: pendingTasks,
  };
}

function systemPrompt(snapshot: CommercialAiSnapshot): string {
  return `Sos el asistente comercial de ${snapshot.orgName} dentro de Rhinos, el sistema de gestión de la distribuidora. Ayudás a ${snapshot.role === "gerente" ? "un gerente comercial a seguir al equipo" : "un vendedor a decidir a quién llamar, qué ofrecer y qué escribir"}.
Respondés en español rioplatense, con voseo, directo y breve: hasta unas 120 palabras salvo que pidan más detalle.
Usá solo los datos del JSON de abajo. Si algo no está, decilo y sugerí dónde mirarlo en Rhinos. No inventes números ni clientes.
Cuando nombres un cliente escribilo así: [[cli:CID|Nombre]]; una oportunidad: [[opp:ID|Nombre del cliente]]. Así el usuario lo abre con un toque.
Montos en pesos argentinos abreviados ($1,2M, $350k). Podés usar viñetas con "- " y **negrita** para lo clave. Si te piden un mensaje para un cliente, escribilo listo para WhatsApp.`;
}

export async function askAssistant(
  snapshot: CommercialAiSnapshot,
  history: AssistantMessage[]
): Promise<string> {
  const client = new Anthropic();
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  // La conversación tiene que arrancar con el usuario.
  while (trimmed.length && trimmed[0].role !== "user") {
    trimmed.shift();
  }

  const response = await client.beta.messages.create({
    model: process.env.COMMERCIAL_AI_MODEL || DEFAULT_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      {
        type: "text",
        text: `${systemPrompt(snapshot)}\n\nDATOS:\n${JSON.stringify(buildAssistantContext(snapshot))}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: trimmed,
  });

  if (response.stop_reason === "refusal") {
    return "No puedo ayudarte con eso. Probá preguntarme por tus clientes, oportunidades o la meta del mes.";
  }
  const text = response.content
    .filter(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text"
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (response.stop_reason === "max_tokens") {
    return `${text}\n\n(La respuesta quedó cortada: pedime menos a la vez.)`;
  }
  return text || "No tengo una respuesta para eso.";
}

/* ============ Respuestas con reglas (sin IA) ============ */

const link = (kind: "cli" | "opp", id: string, label: string) =>
  `[[${kind}:${id}|${label}]]`;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: una rama por pregunta sugerida, más claro en un solo lugar
export function answerWithRules(
  snapshot: CommercialAiSnapshot,
  question: string
): string | null {
  const open = snapshot.opportunities.filter(
    (o) => o.effectiveStage === "nueva"
  );
  const retention = open.filter(
    (o) => o.type === "riesgo" || o.type === "reactivar"
  );
  const growth = open.filter(
    (o) => o.type === "faltante" || o.type === "cross"
  );
  const elapsed = snapshot.plan.dayOfMonth / snapshot.plan.daysInMonth;
  const [q1, q2, q3, q4] = SUGGESTED_QUESTIONS.vendedor;
  const [g1, g2, g3, g4] = SUGGESTED_QUESTIONS.gerente;
  const sellerName = (id: string | null) =>
    snapshot.sellers.find((s) => s.id === id)?.name ?? "Sin asignar";

  switch (question) {
    case q1: {
      const tasks = snapshot.tasks.filter(
        (t) => !t.doneAt && t.dueDate <= snapshot.today
      );
      return `Hoy tenés:\n- ${retention.length} clientes que se pueden ir, por ~${formatMoneyShort(retention.reduce((a, o) => a + o.value, 0))}/mes\n- ${growth.length} oportunidades para venderle más a tu cartera\n- ${tasks.length} próximos pasos vencidos o para hoy`;
    }
    case q2: {
      const first = retention[0] ?? growth[0];
      return first
        ? `Arrancá por ${link("opp", first.key, first.customerName)}: ${first.evidenceShort}. Hay ~${formatMoneyShort(first.value)}/mes en juego.`
        : "No tenés oportunidades nuevas para hoy.";
    }
    case q3: {
      const mine = snapshot.plan.sellers[0];
      if (!mine?.target) {
        return `Llevás **${formatMoneyShort(mine?.real ?? 0)}** este mes. Todavía no hay una meta cargada: pedíle a tu gerente que la fije en Objetivos.`;
      }
      const projected = mine.real / elapsed;
      return `Llevás **${formatMoneyShort(mine.real)} de ${formatMoneyShort(mine.target)}** (${Math.round((mine.real / mine.target) * 100)} %) con el ${Math.round(elapsed * 100)} % del mes. A este ritmo cerrás en ${formatMoneyShort(projected)}.`;
    }
    case q4: {
      const target = retention.find((o) => o.type === "riesgo") ?? retention[0];
      return target
        ? `Para ${link("opp", target.key, target.customerName)}:\n\n${target.message}`
        : "No tenés clientes en riesgo abiertos.";
    }
    case g1: {
      const team = snapshot.plan.team;
      const lines = snapshot.plan.sellers
        .map(
          (s) =>
            `- ${sellerName(s.sellerId)}: ${formatMoneyShort(s.real)}${s.target ? ` de ${formatMoneyShort(s.target)}` : ""}`
        )
        .join("\n");
      return `El equipo lleva **${formatMoneyShort(team.real)}**${team.target ? ` de ${formatMoneyShort(team.target)} (${Math.round((team.real / team.target) * 100)} %)` : ""} con el ${Math.round(elapsed * 100)} % del mes.\n${lines}`;
    }
    case g2: {
      const debtors = snapshot.customers
        .filter((c) => c.overdue > 0)
        .sort((a, b) => b.overdue - a.overdue)
        .slice(0, 8);
      return debtors.length
        ? `Hay ${debtors.length} con deuda vencida:\n${debtors.map((c) => `- ${link("cli", c.id, c.name)} · ${formatMoneyShort(c.overdue)} vencido, hasta ${c.maxDaysLate} días de atraso`).join("\n")}`
        : "Nadie tiene deuda vencida.";
    }
    case g3: {
      const top = snapshot.opportunities
        .filter(
          (o) =>
            (o.type === "riesgo" || o.type === "reactivar") &&
            OPEN_STAGES.includes(o.effectiveStage)
        )
        .slice(0, 5);
      return top.length
        ? `Los que más pesan:\n${top.map((o) => `- ${link("opp", o.key, o.customerName)} (${sellerName(o.sellerId)}): ~${formatMoneyShort(o.value)}/mes · ${o.evidenceShort}`).join("\n")}`
        : "No hay clientes en riesgo ni dormidos con oportunidades abiertas.";
    }
    case g4: {
      const top = snapshot.opportunities
        .filter((o) => OPEN_STAGES.includes(o.effectiveStage))
        .slice(0, 5);
      return top.length
        ? `Las 5 que más valen:\n${top.map((o) => `- ${link("opp", o.key, o.customerName)} · ${OPPORTUNITY_TYPES[o.type].label} · ~${formatMoneyShort(o.value)}/mes`).join("\n")}`
        : "No hay oportunidades abiertas.";
    }
    default:
      return null;
  }
}
