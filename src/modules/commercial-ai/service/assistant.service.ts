import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  OPEN_STAGES,
  OPPORTUNITY_TYPES,
  STAGES,
  SUGGESTED_QUESTIONS,
} from "../constants";
import { formatMoneyShort } from "../engine/analysis";
import type { CommercialAiSnapshot } from "../types";
import { createAiTurn, responseText } from "./ai-client";
import { ASSISTANT_TOOLS, runAssistantTool } from "./assistant-tools";

const MAX_HISTORY_MESSAGES = 12;
const MAX_CONTEXT_OPPORTUNITIES = 40;
const MAX_CONTEXT_CUSTOMERS = 60;
const MAX_CONTEXT_PROSPECTS = 25;

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

  const { prospecting } = snapshot;
  const todayRoutes = prospecting.routes
    .filter((r) => r.date === snapshot.today)
    .map((r) => ({
      ...(isManager ? { vendedor: sellerName(r.sellerId) } : {}),
      paradas: r.stops.map((s) => ({
        n: s.position,
        cuenta: s.name,
        tipo: s.kind,
        resultado: s.result ?? "pendiente",
        motivo: s.reason,
      })),
    }));
  const openProspects = prospecting.prospects
    .filter((p) =>
      [
        "sin_contactar",
        "contactado",
        "en_conversacion",
        "esperando_pedido",
      ].includes(p.stage)
    )
    .slice(0, MAX_CONTEXT_PROSPECTS)
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      zona: p.city,
      encaje: p.fitScore,
      etapa: p.stage,
      ...(isManager ? { vendedor: sellerName(p.sellerId) } : {}),
    }));
  const campaigns = prospecting.campaigns
    .filter((c) => c.status === "activa")
    .map((c) => {
      const mine = prospecting.prospects.filter((p) => p.campaignId === c.id);
      return {
        nombre: c.name,
        objetivo:
          c.goalCount && c.goalKind ? `${c.goalCount} ${c.goalKind}` : null,
        prospectos: mine.length,
        contactados: mine.filter(
          (p) => p.stage !== "sin_contactar" && p.stage !== "descartado"
        ).length,
        en_conversacion: mine.filter(
          (p) => p.stage === "en_conversacion" || p.stage === "esperando_pedido"
        ).length,
      };
    });

  return {
    ruta_de_hoy: todayRoutes,
    prospectos_abiertos: openProspects,
    campanas_activas: campaigns,
    aprendizajes_del_equipo: prospecting.learnings
      .filter((l) => l.status !== "descartada")
      .slice(0, 10)
      .map((l) => l.title),
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
Hoy es ${snapshot.today}. El JSON de abajo es un resumen. Para cualquier dato de ventas que no esté ahí (facturación de un cliente en un período, rankings, productos, ventas por vendedor, comparaciones entre meses o años) usá las herramientas: consultan las ventas reales de Rhinos. Si no tenés el id del cliente, primero usá buscar_clientes. "Este año" va del 1 de enero a hoy; "el mes pasado" es el mes calendario anterior.
Facturación = ventas confirmadas, despachadas, entregadas o incompletas; no cuentan preventas ni canceladas. Si el usuario pregunta por montos, aclaralo en una línea si hace falta.
Nunca inventes números ni clientes: si una herramienta no devuelve el dato, decilo.
Cuando nombres un cliente escribilo así: [[cli:CID|Nombre]]; una oportunidad: [[opp:ID|Nombre del cliente]]; un prospecto: [[pro:ID|Nombre]]. Así el usuario lo abre con un toque.
Montos en pesos argentinos abreviados ($1,2M, $350k). Podés usar viñetas con "- " y **negrita** para lo clave. Si te piden un mensaje para un cliente, escribilo listo para WhatsApp.`;
}

const MAX_TOOL_ROUNDS = 6;

export async function askAssistant(
  snapshot: CommercialAiSnapshot,
  history: AssistantMessage[]
): Promise<string> {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  // La conversación tiene que arrancar con el usuario.
  while (trimmed.length && trimmed[0].role !== "user") {
    trimmed.shift();
  }

  const meter = {
    organizationId: snapshot.organizationId,
    userId: snapshot.currentUserId,
    userName: snapshot.currentUserName,
    feature: "asistente" as const,
  };
  const system = `${systemPrompt(snapshot)}\n\nDATOS:\n${JSON.stringify(buildAssistantContext(snapshot))}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [...trimmed];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await createAiTurn({
      meter,
      system,
      messages,
      maxTokens: 4000,
      tools: ASSISTANT_TOOLS,
    });

    if (response.stop_reason === "refusal") {
      return "No puedo ayudarte con eso. Probá preguntarme por tus clientes, ventas, oportunidades o la meta del mes.";
    }
    if (response.stop_reason !== "tool_use") {
      const text = responseText(response);
      if (response.stop_reason === "max_tokens") {
        return `${text}\n\n(La respuesta quedó cortada: pedime menos a la vez.)`;
      }
      return text || "No tengo una respuesta para eso.";
    }

    // Se devuelve el turno completo del modelo, sin tocarlo, y todas las respuestas juntas.
    messages.push({ role: "assistant", content: response.content });
    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock =>
        block.type === "tool_use"
    );
    const results = await Promise.all(
      toolUses.map((block) => runAssistantTool({ snapshot }, block))
    );
    messages.push({ role: "user", content: results });
  }

  return "Necesité demasiadas consultas para responder. Probá con una pregunta más concreta.";
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
