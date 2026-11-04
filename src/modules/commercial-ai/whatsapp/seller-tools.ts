import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin-client";
import type { AssistantChannel } from "../service/assistant.service";
import type { CommercialAiSnapshot, VisitResult } from "../types";

/**
 * Herramientas que el asistente solo tiene por WhatsApp: el vendedor cuenta lo
 * que pasó ("pasé por X, pidieron 20 kg") y el asistente lo anota en Rhinos.
 * El cliente siempre tiene que estar en la cartera visible del usuario.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESULTS: VisitResult[] = [
  "pedido",
  "interesado",
  "noestaba",
  "seguimiento",
  "nofue",
];
const RESULT_TEXT: Record<VisitResult, string> = {
  pedido: "Pedido",
  interesado: "Interesado",
  noestaba: "No estaba",
  seguimiento: "Seguimiento",
  nofue: "No fue",
};
const MAX_NOTE = 1000;

class SellerToolError extends Error {}

const SELLER_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "registrar_visita",
    description:
      "Anota en Rhinos una visita o charla con un cliente de la cartera del vendedor: el resultado y una nota con lo que pasó (qué pidió, qué dijo, qué quedó pendiente). Si la parada está en la ruta de hoy, la marca como hecha.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        cliente_id: {
          type: "string",
          description: "Id del cliente (de buscar_clientes o del resumen).",
        },
        resultado: {
          type: "string",
          enum: RESULTS,
          description:
            "pedido: hizo o va a hacer un pedido; interesado: le interesó algo; noestaba: no lo atendieron; seguimiento: hay que volver a contactarlo; nofue: no llegó a ir.",
        },
        nota: {
          type: "string",
          description: "Lo que contó el vendedor, en una o dos frases.",
        },
      },
      required: ["cliente_id", "resultado", "nota"],
      additionalProperties: false,
    },
  },
  {
    name: "crear_recordatorio",
    description:
      "Crea un pendiente (próximo paso) para un cliente en una fecha. Aparece en Hoy y en el resumen diario del vendedor.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        fecha: {
          type: "string",
          description: "AAAA-MM-DD. 'El jueves' es el próximo jueves.",
        },
        que: { type: "string", description: "Qué hay que hacer." },
      },
      required: ["cliente_id", "fecha", "que"],
      additionalProperties: false,
    },
  },
];

function customerOf(snapshot: CommercialAiSnapshot, id: unknown) {
  const customer = snapshot.customers.find((c) => c.id === String(id ?? ""));
  if (!customer) {
    throw new SellerToolError(
      "Ese cliente no está en tu cartera. Buscalo con buscar_clientes."
    );
  }
  return customer;
}

function text(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, MAX_NOTE);
}

async function registerVisit(
  snapshot: CommercialAiSnapshot,
  input: Record<string, unknown>
) {
  const customer = customerOf(snapshot, input.cliente_id);
  const result = String(input.resultado) as VisitResult;
  if (!RESULTS.includes(result)) {
    throw new SellerToolError("Resultado inválido.");
  }
  const note = text(input.nota);
  const admin = createAdminClient();

  const route = snapshot.prospecting.routes.find(
    (r) => r.date === snapshot.today && r.sellerId === snapshot.currentUserId
  );
  const stop = route?.stops.find(
    (s) => s.kind === "cliente" && s.accountId === customer.id
  );
  if (stop) {
    const { error } = await admin
      .from("commercial_ai_route_stops")
      .update({ result, note, result_at: new Date().toISOString() })
      .eq("id", stop.id)
      .eq("organization_id", snapshot.organizationId);
    if (error) {
      throw new Error(error.message);
    }
  }

  const [checkin, event] = await Promise.all([
    admin.from("commercial_ai_checkins").insert({
      organization_id: snapshot.organizationId,
      user_id: snapshot.currentUserId,
      user_name: snapshot.currentUserName,
      route_id: route && stop ? route.id : null,
      stop_id: stop?.id ?? null,
      customer_id: customer.id,
      result,
      note,
      location_error: "Cargado por WhatsApp",
    }),
    admin.from("commercial_ai_events").insert({
      organization_id: snapshot.organizationId,
      customer_id: customer.id,
      kind: "note",
      body: `Visita (WhatsApp) · ${RESULT_TEXT[result]}${note ? `: ${note}` : ""}`,
      actor_id: snapshot.currentUserId,
      actor_name: snapshot.currentUserName,
    }),
  ]);
  if (checkin.error || event.error) {
    throw new Error((checkin.error ?? event.error)?.message);
  }
  return {
    guardado: true,
    cliente: customer.name,
    resultado: RESULT_TEXT[result],
    en_ruta_de_hoy: Boolean(stop),
  };
}

async function createReminder(
  snapshot: CommercialAiSnapshot,
  input: Record<string, unknown>
) {
  const customer = customerOf(snapshot, input.cliente_id);
  const date = String(input.fecha ?? "");
  if (!ISO_DATE.test(date)) {
    throw new SellerToolError("La fecha tiene que ser AAAA-MM-DD.");
  }
  if (date < snapshot.today) {
    throw new SellerToolError("La fecha ya pasó. Pedile otra al vendedor.");
  }
  const body = text(input.que);
  if (!body) {
    throw new SellerToolError("Falta qué hay que hacer.");
  }
  const { error } = await createAdminClient()
    .from("commercial_ai_tasks")
    .insert({
      organization_id: snapshot.organizationId,
      customer_id: customer.id,
      seller_id: snapshot.currentUserId,
      body,
      due_date: date,
      created_by: snapshot.currentUserId,
    });
  if (error) {
    throw new Error(error.message);
  }
  return { guardado: true, cliente: customer.name, fecha: date, que: body };
}

const HANDLERS: Record<
  string,
  (snapshot: CommercialAiSnapshot, input: Record<string, unknown>) => unknown
> = {
  registrar_visita: registerVisit,
  crear_recordatorio: createReminder,
};

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const WHATSAPP_PROMPT = `CANAL: WhatsApp. El vendedor te escribe desde la calle.
- Respondé corto (hasta 80 palabras), en texto plano de WhatsApp: *negrita* con un asterisco, viñetas con "• ". No uses links [[...]] ni tablas.
- Si cuenta una visita o charla con un cliente, usá registrar_visita. Si dice que tiene que volver, llamar o mandar algo otro día, usá crear_recordatorio. Si no sabés qué cliente es, usá buscar_clientes; si hay más de uno parecido, preguntale cuál.
- Después de guardar, confirmá en una línea qué anotaste. No inventes datos que no dijo.
- Si pide un mensaje para un cliente, escribilo listo para reenviar.`;

/** Canal WhatsApp para askAssistant: prompt y herramientas de escritura. */
export function whatsappChannel(
  snapshot: CommercialAiSnapshot
): AssistantChannel {
  const weekday = WEEKDAYS[new Date(`${snapshot.today}T12:00:00Z`).getUTCDay()];
  return {
    prompt: `${WHATSAPP_PROMPT}\n- Hoy es ${weekday} ${snapshot.today}.`,
    tools: SELLER_TOOLS,
    runTool: (block) => {
      const handler = HANDLERS[block.name];
      if (!handler) {
        return null;
      }
      return (async () => {
        try {
          const result = await handler(
            snapshot,
            (block.input ?? {}) as Record<string, unknown>
          );
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        } catch (error) {
          const known = error instanceof SellerToolError;
          if (!known) {
            console.error(`IA Comercial: falló ${block.name}`, error);
          }
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            is_error: true,
            content: known ? error.message : "No pude guardarlo ahora.",
          };
        }
      })();
    },
  };
}
