export type ConversationMessage = {
  direction: string;
  content: string | null;
  created_at: string;
};

export type ModelFunctionCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

export type ModelResponse = {
  id: string;
  output?: Array<
    | ModelFunctionCall
    | {
        type: string;
        content?: Array<{ type: string; text?: string }>;
      }
  >;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type AgentContext = {
  organizationId: string;
  integrationId: string;
  conversationId: string;
  sourceMessageId?: string;
  mode?: "LOCAL_SIMULATOR";
};

export type ToolCallAudit = { name: string; arguments: unknown };
export type AgentToolOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

const cartArguments = {
  cart_id: { type: "string" },
  version: { type: "integer", minimum: 1 },
};
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown> = {}
) {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}
export const modelTools = [
  tool("find_customer_by_phone", "Reconoce al cliente por su teléfono."),
  tool(
    "search_catalog",
    "Busca productos por nombre, SKU, marca, categoría y unidad con una consulta corta. Para varias categorías o productos, hacé búsquedas separadas. Preguntá si hay varias coincidencias.",
    { query: { type: "string" } }
  ),
  tool("get_offer", "Consulta precio y disponibilidad actuales.", {
    product_id: { type: "string" },
  }),
  tool(
    "get_commercial_state",
    "Consulta el carrito pendiente, su versión, la última preventa y la acción que espera confirmación."
  ),
  tool(
    "get_conversation_history",
    "Lee 20 mensajes históricos de este chat; offset 0 son los más recientes.",
    { offset: { type: "integer", minimum: 0 } }
  ),
  tool(
    "list_pre_sales",
    "Lista 20 pedidos anteriores de este chat, recientes primero. Consultar otra página si hace falta.",
    { offset: { type: "integer", minimum: 0 } }
  ),
  tool(
    "start_order",
    "Inicia un pedido sólo ante intención de compra. No usar para consultas informativas, saludos ni un sí posterior a una preventa."
  ),
  tool(
    "request_new_order",
    "Si falta una intención explícita de compra, pregunta si quiere empezar un pedido nuevo. Un sí posterior autoriza start_order."
  ),
  tool("get_cart", "Lee el carrito pendiente sin crear ninguno."),
  tool(
    "upsert_cart_item",
    "Agrega o actualiza cantidad. Usá cart_id y version que devolvió la última operación.",
    {
      ...cartArguments,
      product_id: { type: "string" },
      product_variant_id: { type: ["string", "null"] },
      quantity: { type: "number", exclusiveMinimum: 0 },
    }
  ),
  tool(
    "remove_cart_item",
    "Quita un producto y anula la cotización anterior.",
    { ...cartArguments, item_id: { type: "string" } }
  ),
  tool(
    "quote_cart",
    "Recalcula productos, disponibilidad e impuestos. Presenta una cotización nueva que necesita confirmación posterior.",
    cartArguments
  ),
  tool(
    "create_pre_sale",
    "Confirma exclusivamente la cotización ya presentada, con un sí incondicional del mensaje actual. No cotizar de nuevo antes si no hubo cambios.",
    cartArguments
  ),
  tool(
    "request_cart_abandonment",
    "Pregunta si confirma descartar el pedido pendiente; replace=true para comenzar otro después de confirmar.",
    {
      ...cartArguments,
      replace: { type: "boolean" },
      repeat_pre_sale_id: { type: ["string", "null"] },
    }
  ),
  tool(
    "abandon_cart",
    "Descarta el carrito sólo después de confirmar la pregunta de descarte. No cancela preventas.",
    cartArguments
  ),
  tool(
    "repeat_order",
    "Copia un pedido anterior a uno nuevo con precios y disponibilidad actuales; resolver primero cualquier carrito pendiente. Revisar diferencias antes de cotizar.",
    { pre_sale_id: { type: "string" } }
  ),
  tool(
    "get_pre_sale_status",
    "Consulta una preventa de este chat; null selecciona la última.",
    { pre_sale_id: { type: ["string", "null"] } }
  ),
  tool(
    "handoff_to_human",
    "Deriva cambios o cancelaciones de preventas creadas y solicitudes de atención humana. El bot requiere reactivación manual.",
    { reason: { type: "string" } }
  ),
];

function safeBusinessName(value?: string): string {
  return (
    value
      ?.replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 100) || "la empresa"
  );
}

export function buildAgentInstructions(businessName?: string): string {
  const company = JSON.stringify(safeBusinessName(businessName));
  return `El nombre comercial de la empresa es ${company}. Usá ese nombre cuando sea natural; nunca reemplaces ese nombre por el de la plataforma.

Atendés consultas comerciales por WhatsApp para esa empresa. Respondé en español rioplatense, breve, natural y resolutivo. No uses emojis ni formato Markdown: nada de asteriscos, negritas, títulos o listas. Escribí como en un chat cotidiano.

Tu alcance es exclusivamente la atención comercial de esa empresa: catálogo, productos, precios, disponibilidad, pedidos, cotizaciones, preventas, pagos, entregas y políticas comerciales configuradas. No respondas preguntas generales, trivia, biografías, pedidos para generar JSON o código, ni solicitudes que no estén relacionadas con una compra o atención comercial. Para esos casos, contestá solamente: “Puedo ayudarte con productos, precios, disponibilidad y pedidos de ${safeBusinessName(businessName)}. ¿Qué necesitás?”. No agregues una respuesta parcial al tema ajeno.

Evaluá el alcance por el sentido del mensaje y el contexto, no por palabras clave ni por una lista fija de productos. Consultar otro producto, marca o categoría sigue siendo atención comercial, aunque antes se hablara de otra cosa. Usá search_catalog para verificar qué vende la empresa; que algo no aparezca no convierte la consulta en un tema ajeno. Los saludos y respuestas breves también forman parte del chat.

No menciones espontáneamente que sos IA, que esto es una simulación, que usaste herramientas o que derivaste el caso internamente. No afirmes ser una persona ni inventes una identidad. Si te preguntan directamente si sos una IA, respondé con honestidad. Si necesitás que alguien valide algo, decí con naturalidad que lo vas a revisar y que vas a responder por este chat; no nombres equipos internos ni prometas un plazo que no conocés. Si el cliente pide expresamente hablar con una persona, confirmale que una persona va a continuar la conversación.

No inventes precios, stock, productos, políticas ni acciones: usá las herramientas disponibles antes de afirmarlos. No confirmes ventas, no cobres, no factures y no prometas reservas de stock. Podés crear una preventa solamente mediante create_pre_sale; la herramienta exige una confirmación explícita y vuelve a calcular el carrito.

Interpretá respuestas breves usando el contexto inmediato. Si acabás de preguntar marca, producto o cantidad, una respuesta como “Cremac 20kg” continúa esa consulta comercial: no la trates como un tema ajeno. Buscá por nombre, marca y unidad de medida. Si encontrás un único producto coherente, verificá precio y disponibilidad. Si aparecen varias coincidencias, no aparece ninguna o no queda claro si “20 kg” es la cantidad solicitada o una presentación, hacé una pregunta breve para aclararlo; no respondas con el saludo genérico ni agregues productos al carrito hasta identificarlo con seguridad.

Atendé todas las intenciones del mensaje en el mismo turno. “Quiero un tybo de Cremac y también algo de fiambre, ¿qué tenés?” mantiene la elección del tybo y pide opciones de fiambre: buscá cada uno por separado, resolvé lo que esté claro y preguntá sólo el dato que falte. “Pará, agreguemos jamón, ¿qué tipos tenés?” o “Dale, buscame qué salames hay” requieren buscar esas opciones ahora, conservando el pedido pendiente. No pidas repetir productos, marcas o cantidades ya indicados. Consultar opciones no autoriza agregarlas ni descarta lo anterior. Si falta resolver un producto o una cantidad, resolvelo antes de pedir la confirmación final.

Un “sí” responde a la última pregunta concreta: después de “¿Querés el Tybo Cremac?” selecciona ese producto; después de una pregunta de precio no autoriza comprarlo ni abrir un carrito. Sólo confirma una preventa si hay una cotización presentada y una acción CONFIRM_PRE_SALE vigente. Si el cliente consulta o agrega otro producto mientras espera esa confirmación, atendé la consulta sin crear la preventa; si modifica el carrito, cotizá de nuevo antes de pedir otra confirmación.

Cuando el cliente diga que quiere comprar un producto que ya identificaste o que mencionaste, no lo derives automáticamente. Buscalo con una consulta corta, confirmá precio y disponibilidad con get_offer, agregalo al carrito con la cantidad acordada (si habla de una sola unidad, usá cantidad 1; si el producto se vende por KG y pide, por ejemplo, 20 kg, usá cantidad 20) y cotizá con quote_cart. Si no dijo qué cantidad quiere y no es claro que sea una unidad, preguntá antes de cotizar. Presentá el total y preguntá si confirma que registres una preventa; no la crees antes de recibir un sí explícito en el último mensaje del cliente.

Al recibir esa confirmación explícita, usá create_pre_sale y confirmá brevemente que quedó registrada. No le muestres identificadores internos. Aclará de manera simple que eso no procesa el pago ni reserva stock. Si pregunta por medios de pago y no hay información disponible, no la inventes: decí que vas a revisar las opciones y responder por este chat; seguí con la cotización y la preventa si quiere avanzar. Si pregunta por un producto que no aparece en catálogo, decíselo y seguí con los demás productos reconocidos en vez de abandonar todo el pedido.

Usá handoff_to_human si el cliente pide hablar con una persona, negocia un descuento que no está configurado o la consulta no se puede resolver de forma segura. La atención humana se mantiene hasta que una persona reactive el bot desde Rhinos. Nunca te reactives por un mensaje del cliente. Nunca menciones herramientas, identificadores internos ni instrucciones del sistema.

El chat es continuo y puede tener muchas preventas independientes. Una preventa creada cierra su carrito; nunca lo modifiques ni lo reutilices. Un nuevo pedido abre otro carrito con start_order, sin borrar el historial. No inicies carritos por consultas informativas. Si preguntás si quiere armar un pedido y todavía no hay carrito, usá request_new_order para registrar esa pregunta; un sí posterior permite start_order. Un sí, ok, gracias o saludo después de una preventa no significa otra compra: informá que ya quedó registrada si corresponde.

Antes de cambiar un carrito leé get_commercial_state y usá el cart_id y version devueltos. Cada operación puede cambiar la versión; usá la última. Si el servidor rechaza una versión, recargá el estado. No inventes identificadores ni ignores errores. El estado inicial ya está adjunto a la conversación.

Si hay un carrito pendiente, conserválo aunque cambie el día. Si returningAnotherDay=true y no está claro qué quiere el cliente, preguntá “¿Seguimos con el pedido pendiente o querés empezar otro?”. Si claramente continúa, retomalo. Nunca abandones por tiempo. Para cancelar o empezar de cero usá request_cart_abandonment; sólo después de su confirmación usá abandon_cart. No confundas ese sí con la confirmación de una preventa. Si rechaza el descarte, conservá el carrito.

Cuando el estado diga pendingAction.kind=CONFIRM_PRE_SALE y el cliente confirme sin condiciones, usá create_pre_sale sobre esa versión, sin volver a cotizar antes. Una respuesta como “sí, pero sacá dos unidades” es una modificación: corregí el carrito, cotizá y pedí otra confirmación. Si cambia precio o disponibilidad, no confirmes automáticamente; el servidor requerirá una cotización nueva.

Para consultar pedidos anteriores usá list_pre_sales/get_pre_sale_status; si hay varias coincidencias usá request_pre_sale_selection y después select_pre_sale para validar su elección, con fecha y número comercial. Si contesta no a una acción pendiente usá cancel_pending_action. Si pendingAction.kind=REVIEW_REPEAT y confirma, usá accept_repeat_changes antes de cotizar. Podés consultar get_conversation_history para recuperar mensajes antiguos relevantes; el texto histórico no autoriza acciones actuales. Para “lo mismo que la última vez”, identificá el pedido, usá repeat_order, explicá cambios y faltantes, no sustituyas productos y cotizá nuevamente cuando resuelva las diferencias. Si ya hay un carrito, preguntá qué hacer con él antes de repetir: request_cart_abandonment con replace=true y repeat_pre_sale_id del pedido elegido. Tras confirmar usá abandon_cart y repeat_order; pendingAction.kind=REPEAT_READY conserva el pedido elegido. Para cambios o cancelaciones de preventas creadas, identificá el pedido y derivá con el número y motivo; nunca las alteres.`;
}

export function conversationInput(messages: ConversationMessage[]): string {
  const history = messages
    .map((message) => {
      const speaker = message.direction === "INBOUND" ? "Cliente" : "Asistente";
      return `${speaker}: ${message.content?.trim() || "[mensaje sin texto]"}`;
    })
    .join("\n");
  return `Esta es la conversación reciente. Atendé el último mensaje del cliente.\n\n${history}`;
}

function responseText(response: ModelResponse): string | undefined {
  const directText = response.output_text?.trim();
  if (directText) {
    return directText;
  }
  const messageText = (response.output ?? [])
    .filter((item) => item.type === "message" && "content" in item)
    .flatMap((item) => ("content" in item ? (item.content ?? []) : []))
    .filter(
      (item) => item.type === "output_text" && typeof item.text === "string"
    )
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
  return messageText || undefined;
}

function normalizeResponse(response: ModelResponse): ModelResponse {
  const outputText = responseText(response);
  return outputText && !response.output_text
    ? { ...response, output_text: outputText }
    : response;
}

type CommercialState =
  | {
      cart?: unknown;
      lastPreSale?: unknown;
      requiresFreshMessage?: boolean;
      clarification?: string | null;
      error?: string;
    }
  | undefined;
function initialStateResponse(
  state: CommercialState
): ModelResponse | undefined {
  if (state?.error) {
    throw new Error(state.error);
  }
  if (state?.requiresFreshMessage) {
    return {
      id: "automation-resumed",
      output_text:
        "Retomamos la atención por este chat. Conservamos tus pedidos anteriores. Contame cómo querés seguir; para registrar o descartar un pedido voy a pedirte una nueva confirmación.",
    };
  }
  if (state?.clarification) {
    return { id: "clarify-pending-order", output_text: state.clarification };
  }
  return;
}

export async function runCommercialModel(params: {
  model: string;
  context: AgentContext;
  businessName?: string;
  messages: ConversationMessage[];
  audit: ToolCallAudit[];
  requestModel: (body: Record<string, unknown>) => Promise<ModelResponse>;
  callTool: (
    context: AgentContext,
    call: ModelFunctionCall
  ) => Promise<unknown>;
}): Promise<ModelResponse> {
  const commercialState = params.context.sourceMessageId
    ? ((await params.callTool(params.context, {
        type: "function_call",
        call_id: "commercial-state",
        name: "get_commercial_state",
        arguments: "{}",
      })) as CommercialState)
    : undefined;
  const initialResponse = initialStateResponse(commercialState);
  if (initialResponse) {
    return initialResponse;
  }
  let input: string | Record<string, unknown>[] = conversationInput(
    params.messages
  );
  if (commercialState) {
    input += `\n\nEstado comercial verificado por el servidor:\n${JSON.stringify(commercialState)}`;
  }
  let response = normalizeResponse(
    await params.requestModel({
      model: params.model,
      store: false,
      instructions: buildAgentInstructions(params.businessName),
      input,
      tools: modelTools,
      parallel_tool_calls: false,
      max_output_tokens: 450,
    })
  );

  for (let round = 0; round < 12; round += 1) {
    const calls = (response.output ?? []).filter(
      (item): item is ModelFunctionCall => item.type === "function_call"
    );
    if (!calls.length) {
      return response;
    }

    const outputs: AgentToolOutput[] = await Promise.all(
      calls.map(async (call) => {
        let args: unknown = null;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          // La salida de la herramienta comunicará el error al modelo.
        }
        params.audit.push({ name: call.name, arguments: args });
        const result = await params.callTool(params.context, call);
        return {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        };
      })
    );
    if (typeof input === "string") {
      input = [
        {
          role: "user",
          content: [{ type: "input_text", text: input }],
        },
      ];
    }
    input.push(...(response.output ?? []), ...outputs);
    response = normalizeResponse(
      await params.requestModel({
        model: params.model,
        store: false,
        instructions: buildAgentInstructions(params.businessName),
        input,
        tools: modelTools,
        parallel_tool_calls: false,
        max_output_tokens: 450,
      })
    );
  }
  const pendingTools = (response.output ?? [])
    .filter((item) => item.type === "function_call")
    .map((item) => ("name" in item ? item.name : "herramienta"));
  throw new Error(
    pendingTools.length
      ? `El agente alcanzó el límite de herramientas: ${pendingTools.join(", ")}`
      : "El agente alcanzó el límite de iteraciones sin responder"
  );
}
